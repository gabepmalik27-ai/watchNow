# WatchNow

A movie discovery and recommendation web app built for CSC 371 at Wake
Forest. WatchNow helps you discover, rate, and decide what to watch —
you don't watch movies inside the app itself.

## Current phase: Data (Supabase + TMDB catalog)

All five routes read a real movie catalog: a Supabase `movies` table
(`supabase/migrations/0001_movies.sql`) seeded from TMDB by
`npm run seed` (`scripts/seed-movies.ts`). Pages query it only through
`lib/catalog.ts`; posters load from TMDB's image CDN. Ratings, watched
state and the watchlist are still in-memory session state
(`lib/user-state.tsx`, no persistence — a refresh resets it).

There is intentionally no authentication and no real recommendation logic
yet. See `CLAUDE.md` for the full list of what's in and out of scope for
this phase, plus the design tokens and hard rules the UI follows.

## Specs

- `CLAUDE.md` — project guardrails: scope, design tokens, responsive
  rules, accessibility requirements.
- `docs/design-spec.pdf` — the visual design specification (page-by-page
  mockups for every view).

## Running locally

Requires Node 20+.

```bash
git clone https://github.com/gabepmalik27-ai/watchNow.git
cd watchNow
npm install
cp .env.example .env.local   # then fill in the four values
npm run check-env            # verifies names/format and connectivity
npm run dev
```

First-time database setup:

1. Paste `supabase/migrations/0001_movies.sql` into the Supabase SQL editor
   and run it.
2. `npm run seed -- --limit 100` for a quick test, then `npm run seed` for
   the full ~5,000-movie catalog. Reruns are safe (rows are upserted by id).

Open [http://localhost:3000](http://localhost:3000). The app is
localhost-only for this phase — there's no deployment or CI yet.

## Stack

- Next.js 15 (App Router), TypeScript (strict), Tailwind CSS v4
- Supabase Postgres (catalog, read through RLS with the anon key)
- TMDB API (seed script only) and TMDB image CDN (posters)
- React Context for in-session user state — no `localStorage`

## Team

- [@gabepmalik27-ai](https://github.com/gabepmalik27-ai)
- _teammate 2_
- _teammate 3_

## How we work

- `main` is always working code. Nobody pushes to it directly.
- Do your work on a branch: `git checkout -b your-name/what-youre-doing`
- Push the branch and open a Pull Request.
- One teammate reviews and approves, then merge.
- Pull `main` before starting anything new: `git checkout main && git pull`

## Secrets

Never commit API keys. Put them in a `.env` file (already gitignored) and
add the variable *names* to `.env.example` so everyone knows what they need.
