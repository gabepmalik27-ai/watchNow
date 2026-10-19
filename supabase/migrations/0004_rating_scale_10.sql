-- WatchNow: user ratings move from half-stars (0.5–5.0) to integers 1–10.
-- Rerunnable; paste the whole file into the SQL editor. Run it right after the
-- matching app deploy is live (see the PR description for the order).
--
-- 4.5 stars becomes 9/10, 0.5 becomes 1/10. Running it twice is safe: the type
-- change is skipped once the column is already smallint, so ratings are never
-- doubled twice.

begin;

-- 1. Drop the old rating check. It was an unnamed inline check in 0002, so find
--    it in pg_constraint instead of guessing its name: any check constraint that
--    covers ONLY the rating column, except the new one. The 0003 constraints
--    also mention rating but cover a second column, so they are left alone.
do $$
declare
  rating_attnum smallint;
  old_check record;
begin
  select attnum into rating_attnum
    from pg_attribute
   where attrelid = 'public.user_movies'::regclass
     and attname = 'rating'
     and not attisdropped;

  for old_check in
    select conname
      from pg_constraint
     where conrelid = 'public.user_movies'::regclass
       and contype = 'c'
       and conkey = array[rating_attnum]
       and conname <> 'user_movies_rating_1_10'
  loop
    execute format('alter table public.user_movies drop constraint %I', old_check.conname);
  end loop;
end $$;

-- 2. numeric(2,1) cannot hold 10, so change the type, doubling the stored value.
--    Skipped when the column is already smallint (rerun).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'user_movies'
       and column_name = 'rating'
       and data_type = 'numeric'
  ) then
    alter table public.user_movies
      alter column rating type smallint using round(rating * 2)::smallint;
  end if;
end $$;

-- 3. The new check: a whole number from 1 to 10, or no rating.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'user_movies_rating_1_10'
       and conrelid = 'public.user_movies'::regclass
  ) then
    alter table public.user_movies
      add constraint user_movies_rating_1_10
      check (rating is null or rating between 1 and 10);
  end if;
end $$;

-- 0003's user_movies_rated_is_watched and user_movies_watched_not_on_watchlist
-- are untouched: neither depends on the rating scale.

commit;
