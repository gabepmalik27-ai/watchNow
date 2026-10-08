-- WatchNow catalog: one row per TMDB movie. Written only by the seed script
-- (service role); readable by anyone through RLS. Statements are rerunnable.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.movies (
  id                integer primary key,  -- TMDB movie id
  title             text not null,
  overview          text,
  release_date      date,
  release_year      int generated always as (extract(year from release_date)::int) stored,
  runtime_min       int,
  vote_average      numeric(3,1),
  vote_count        int,
  popularity        numeric,
  original_language text,
  poster_path       text,
  backdrop_path     text,
  genres            text[] not null default '{}',
  keywords          text[] not null default '{}',
  director          text,
  top_cast          text[] not null default '{}',
  tmdb_synced_at    timestamptz not null default now()
);

create index if not exists movies_genres_idx       on public.movies using gin (genres);
create index if not exists movies_popularity_idx   on public.movies (popularity desc nulls last);
create index if not exists movies_vote_count_idx   on public.movies (vote_count desc nulls last);
create index if not exists movies_release_date_idx on public.movies (release_date desc nulls last);
-- Trigram index on title (not lower(title)): PostgREST's ilike filter emits
-- `title ILIKE '%q%'`, which a gin_trgm_ops index on title serves directly.
create index if not exists movies_title_trgm_idx   on public.movies using gin (title extensions.gin_trgm_ops);

alter table public.movies enable row level security;

-- Read-only for everyone. No insert/update/delete policies exist, so only the
-- service role (which bypasses RLS) can write.
drop policy if exists "Movies are readable by everyone" on public.movies;
create policy "Movies are readable by everyone"
  on public.movies for select
  to anon, authenticated
  using (true);

-- Distinct genre names for the Search chips. security_invoker makes the view
-- run with the caller's permissions, so the RLS policy above still applies.
create or replace view public.movie_genres
  with (security_invoker = true) as
  select distinct unnest(genres) as name
  from public.movies;
