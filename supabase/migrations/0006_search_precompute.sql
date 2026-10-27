-- WatchNow search, precomputed: 0005's search_catalog normalized every title,
-- director and cast name with unaccent on every call. At ~22,000 movies that
-- is ~150,000 unaccent calls per search (2-3 s, at the anon statement timeout).
-- This stores the normalized values once per row in generated columns and
-- rewrites search_catalog to compare them. Same signature, same tiers, same
-- results. Additive and rerunnable. Run by hand in the Supabase SQL editor.

-- search_norm over an array, keeping positions, so cast_norm[i] is the
-- normalized top_cast[i]. IMMUTABLE because search_norm is.
create or replace function public.search_norm_array(input text[])
returns text[]
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select coalesce(
    array(
      select public.search_norm(name)
      from pg_catalog.unnest(input) with ordinality as cast_member(name, ord)
      order by ord
    ),
    '{}'
  )
$$;

grant execute on function public.search_norm_array(text[]) to anon, authenticated;

-- All normalized cast names in one string, each preceded by a space and
-- separated by "|": ' tom hanks| robin wright'. A normalized query holds only
-- [a-z0-9 ], so a word-start LIKE on this can never match across two names.
-- Lets tier 5 test one string per row instead of unnesting the array.
create or replace function public.search_norm_cast_text(input text[])
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select ' ' || pg_catalog.array_to_string(public.search_norm_array(input), '| ')
$$;

grant execute on function public.search_norm_cast_text(text[]) to anon, authenticated;

-- Stored generated columns: computed on insert/update (the seed and import
-- upserts never write them), so search reads them instead of recomputing.
alter table public.movies
  add column if not exists title_norm    text   generated always as (public.search_norm(title)) stored,
  add column if not exists director_norm text   generated always as (public.search_norm(director)) stored,
  add column if not exists cast_norm     text[] generated always as (public.search_norm_array(top_cast)) stored,
  add column if not exists cast_text     text   generated always as (public.search_norm_cast_text(top_cast)) stored;

-- Same tiers, order and fallback as 0005 (see the comment there); only the
-- normalization moved out of the query.
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
      m.title_norm    as t,
      m.director_norm as d,
      m.cast_norm,
      m.cast_text,
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
        when (' ' || c.d) like ('% ' || c.n || '%') then 4
        when c.cast_text like ('% ' || c.n || '%') then 5
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
      m.cast_norm,
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
      c.cast_norm,
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
      c.cast_norm,
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
        select t.top_cast[cn.ord]
        from unnest(t.cast_norm) with ordinality as cn(name, ord)
        where (' ' || cn.name) like ('% ' || t.n || '%')
        order by cn.ord
        limit 1
      )
    end as match_person
  from top_rows t
  order by t.tier, t.sim desc, t.vote_count desc nulls last, t.id
$$;

grant execute on function public.search_catalog(text, text, int) to anon, authenticated;
