-- WatchNow: user_movies invariants, enforced by the database so no client
-- (or bug) can store a contradictory row. Rerunnable; paste the whole file
-- into the SQL editor.

-- ─── A rated movie is always watched ────────────────────────────────────────
-- Runs first: rows it marks watched may be on the watchlist, which the next
-- section clears.
update public.user_movies
   set watched = true
 where rating is not null and not watched;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'user_movies_rated_is_watched'
       and conrelid = 'public.user_movies'::regclass
  ) then
    alter table public.user_movies
      add constraint user_movies_rated_is_watched
      check (not (rating is not null and not watched));
  end if;
end $$;

-- ─── A watched movie is never on the watchlist ─────────────────────────────
-- Fix existing rows first, or adding the constraint would fail.
update public.user_movies
   set on_watchlist = false
 where watched and on_watchlist;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'user_movies_watched_not_on_watchlist'
       and conrelid = 'public.user_movies'::regclass
  ) then
    alter table public.user_movies
      add constraint user_movies_watched_not_on_watchlist
      check (not (watched and on_watchlist));
  end if;
end $$;
