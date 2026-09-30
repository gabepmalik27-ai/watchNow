# WatchNow

A movie discovery and recommendation web app built for CSC 371 at Wake
Forest. WatchNow helps you discover, rate, and decide what to watch —
you don't watch movies inside the app itself.

## Current phase: Frontend Shell

This repo currently contains the **visual and navigational shell only**.
All five routes render, are reachable from the global navigation, and use
mocked placeholder data (`lib/placeholder-data.ts`) and in-memory session
state (`lib/user-state.tsx`, no persistence — a refresh resets it).

There is intentionally no database, no API routes, no external API calls
(TMDB or otherwise), no authentication, and no real recommendation logic
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
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app is
localhost-only for this phase — there's no deployment, CI, or environment
configuration yet.

## Stack

- Next.js 15 (App Router), TypeScript (strict), Tailwind CSS v4
- React Context for in-session state — no `localStorage`, no database

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
