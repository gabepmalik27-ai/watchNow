-- WatchNow accounts: profiles (one per auth user, created by trigger) and
-- user_movies (per-user rating / watched / watchlist state). All statements
-- are rerunnable; paste the whole file into the SQL editor.

-- ─── profiles ──────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select, update on public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Creates the profile row in the same transaction as the auth.users insert.
-- security definer: runs as the function owner (postgres), because the
-- signing-up user has no INSERT grant or policy on profiles.
-- search_path = '': every name below is schema-qualified, so a malicious
-- object on the caller's search_path can't be substituted in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(new.email, '@', 1), ''),
        'WatchNow member'
      ),
      50
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Not callable through the API; it only runs as a trigger.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── user_movies ───────────────────────────────────────────────────────────
create table if not exists public.user_movies (
  user_id        uuid not null references auth.users (id) on delete cascade,
  movie_id       integer not null references public.movies (id),
  watched        boolean not null default false,
  rating         numeric(2,1)
                   check (rating between 0.5 and 5 and rating * 2 = floor(rating * 2)),
  on_watchlist   boolean not null default false,
  not_interested boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (user_id, movie_id)
);

create index if not exists user_movies_user_updated_idx
  on public.user_movies (user_id, updated_at desc);

alter table public.user_movies enable row level security;

grant select, insert, update, delete on public.user_movies to authenticated;

drop policy if exists "Users can read their own movies" on public.user_movies;
create policy "Users can read their own movies"
  on public.user_movies for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own movies" on public.user_movies;
create policy "Users can insert their own movies"
  on public.user_movies for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own movies" on public.user_movies;
create policy "Users can update their own movies"
  on public.user_movies for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own movies" on public.user_movies;
create policy "Users can delete their own movies"
  on public.user_movies for delete
  to authenticated
  using ((select auth.uid()) = user_id);
