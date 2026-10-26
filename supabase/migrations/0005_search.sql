-- WatchNow search: one ranked, accent-insensitive, typo-tolerant function the
-- app calls through supabase .rpc("search_catalog"). Additive only: nothing the
-- current app uses is changed, and every statement is rerunnable.
-- Run by hand in the Supabase SQL editor before deploying the search overhaul.

create extension if not exists unaccent with schema extensions;

-- search_norm("Spider-Man") = 'spider man', ("WALL·E") = 'wall e', ("Amélie") = 'amelie'.
-- unaccent() is only STABLE, so this wraps it in the standard immutable pattern:
-- the dictionary is passed explicitly (no search_path lookup at call time), every
-- name is schema-qualified, and search_path is emptied. That makes the wrapper
-- safe to declare IMMUTABLE and therefore indexable.
create or replace function public.search_norm(input text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.lower(
        extensions.unaccent('extensions.unaccent'::pg_catalog.regdictionary, input)
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  )
$$;

grant execute on function public.search_norm(text) to anon, authenticated;

create index if not exists movies_title_norm_trgm_idx
  on public.movies using gin (public.search_norm(title) extensions.gin_trgm_ops);

-- Ranked catalog search. SECURITY INVOKER, so the movies RLS policy still applies.
--
-- A row takes its best tier (lower is better):
--   0 exact title        1 title prefix       2 title word-start
--   3 title contains (only when the query is 3+ chars, so "up" can't match
--     "Superman" mid-word)
--   4 director word-start                     5 cast word-start (billing order)
-- Ties break on vote_count desc, then id, so the order is deterministic.
--
-- Fuzzy fallback: ONLY when tiers 0-5 return zero rows, rows whose normalized
-- title has trigram similarity >= fuzzy_threshold (0.3) to the query, best first.
--
-- An empty normalized query with a genre returns that genre, most-voted first.
-- max_results is clamped to 1..100.
create or replace function public.search_catalog(
  q           text,
  genre       text default null,
  max_results int  default 40
)
returns table (
  id            integer,
  title         text,
  overview      text,
  release_year  integer,
  runtime_min   integer,
  vote_average  numeric(3,1),
  vote_count    integer,
  poster_path   text,
  backdrop_path text,
  genres        text[],
  director      text,
  top_cast      text[],
  match_kind    text,
  match_person  text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      coalesce(public.search_norm(search_catalog.q), '') as n,
      nullif(search_catalog.genre, '')                   as genre,
      0.3::real                                          as fuzzy_threshold
  ),
  candidates as (
    select
      m.id, m.title, m.overview, m.release_year, m.runtime_min, m.vote_average,
      m.vote_count, m.poster_path, m.backdrop_path, m.genres, m.director, m.top_cast,
      public.search_norm(m.title) as t,
      p.n,
      p.fuzzy_threshold
    from public.movies m
    cross join params p
    where p.genre is null or m.genres @> array[p.genre]
  ),
  tiered as (
    select
      c.*,
      case
        when c.t = c.n then 0
        when c.t like (c.n || '%') then 1
        when (' ' || c.t) like ('% ' || c.n || '%') then 2
        when length(c.n) >= 3 and c.t like ('%' || c.n || '%') then 3
        when (' ' || public.search_norm(c.director)) like ('% ' || c.n || '%') then 4
        when exists (
          select 1
          from unnest(c.top_cast) as cn(name)
          where (' ' || public.search_norm(cn.name)) like ('% ' || c.n || '%')
        ) then 5
      end as tier
    from candidates c
    where c.n <> ''
  ),
  matched as (
    select * from tiered where tier is not null
  ),
  ranked_matches as (
    select
      m.id, m.title, m.overview, m.release_year, m.runtime_min, m.vote_average,
      m.vote_count, m.poster_path, m.backdrop_path, m.genres, m.director, m.top_cast,
      m.n,
      m.tier,
      case
        when m.tier <= 3 then 'title'
        when m.tier = 4 then 'director'
        else 'cast'
      end as kind,
      0::real as sim
    from matched m
  ),
  fuzzy as (
    select
      c.id, c.title, c.overview, c.release_year, c.runtime_min, c.vote_average,
      c.vote_count, c.poster_path, c.backdrop_path, c.genres, c.director, c.top_cast,
      c.n,
      6 as tier,
      'fuzzy'::text as kind,
      extensions.similarity(c.t, c.n) as sim
    from candidates c
    where c.n <> ''
      and not exists (select 1 from matched)
      and extensions.similarity(c.t, c.n) >= c.fuzzy_threshold
  ),
  genre_only as (
    select
      c.id, c.title, c.overview, c.release_year, c.runtime_min, c.vote_average,
      c.vote_count, c.poster_path, c.backdrop_path, c.genres, c.director, c.top_cast,
      c.n,
      0 as tier,
      'genre'::text as kind,
      0::real as sim
    from candidates c
    cross join params p
    where c.n = '' and p.genre is not null
  ),
  ranked as (
    select * from ranked_matches
    union all
    select * from fuzzy
    union all
    select * from genre_only
  ),
  top_rows as (
    select * from ranked r
    order by r.tier, r.sim desc, r.vote_count desc nulls last, r.id
    limit least(greatest(coalesce(search_catalog.max_results, 40), 1), 100)
  )
  select
    t.id, t.title, t.overview, t.release_year, t.runtime_min, t.vote_average,
    t.vote_count, t.poster_path, t.backdrop_path, t.genres, t.director, t.top_cast,
    t.kind as match_kind,
    case t.kind
      when 'director' then t.director
      when 'cast' then (
        select cn.name
        from unnest(t.top_cast) with ordinality as cn(name, ord)
        where (' ' || public.search_norm(cn.name)) like ('% ' || t.n || '%')
        order by cn.ord
        limit 1
      )
    end as match_person
  from top_rows t
  order by t.tier, t.sim desc, t.vote_count desc nulls last, t.id
$$;

grant execute on function public.search_catalog(text, text, int) to anon, authenticated;
