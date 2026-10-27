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

## Search

All matching and ranking is one Postgres function, `search_catalog` (`supabase/migrations/0005_search.sql`, reading normalized columns precomputed by `0006_search_precompute.sql`), called through `supabase.rpc` by `lib/catalog.ts`. Titles, directors and cast are normalized (lowercase, accents and punctuation dropped, so "amelie" finds Amélie and "spider man" finds Spider-Man). A movie takes its best tier: exact title, title prefix, title word-start, title contains (3+ characters only), director word-start, cast word-start. Ties break on vote count. People searches return their movies with a "Directed by" / "Stars" hint. Only when nothing matches does a trigram-similarity fallback (threshold 0.3) offer close matches for typos.

`npm run check-search` runs the acceptance cases against the live catalog with the anon key. **Run migrations 0005 and 0006 in the Supabase SQL editor before deploying**, or search will fail (0006 keeps it under the anon statement timeout at catalog sizes past ~5,000).

## Import on search miss

If a search of 3+ characters finds nothing, or only typo guesses, `/api/search` asks TMDB (`lib/catalog-admin.ts`), saves up to 5 films with 20+ votes to `public.movies` permanently, and returns them in the same response. It has a 4 second budget and never fails the search. A query that imports nothing is remembered for 10 minutes, and identical concurrent requests share one TMDB call; both caches are per serverless instance and best-effort. Responses where an import was attempted are `no-store` and carry `x-watchnow-imported: <n>`. This is the only app code that uses `SUPABASE_SERVICE_ROLE_KEY`, so **Vercel needs both `SUPABASE_SERVICE_ROLE_KEY` and `TMDB_READ_TOKEN` as server-only environment variables** (Production and Preview).

## Stack

- Next.js 15 (App Router), TypeScript (strict), Tailwind CSS v4
- Supabase Postgres (catalog, read through RLS with the anon key)
- TMDB API (the seed script, and import on search miss) and TMDB image CDN (posters)
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
