# WatchNow — Project Guardrails

## What this is

WatchNow is a movie discovery and recommendation web app built for CSC 371 at Wake Forest. Users do not watch movies here. The app helps them discover, rate, and decide what to watch.

Design spec: `docs/design-spec.pdf`
Reference screenshot: `docs/rate-page-screenshot.png`

## Current phase: RECOMMENDER (content-based scoring)

The shell, the Supabase catalog and user accounts are done. We are now building the recommendation engine that powers For You, Home's "Recommended for you" row and Recommend.

**In scope:**
- Content-based, deterministic recommendation scoring (taste profile, candidate features, context, explanations). The same inputs always give the same output.
- All scoring math as pure functions in `lib/recommender/` (no React, no fetching, no `Date.now()`; "now" is passed in), with every weight and threshold named in `lib/recommender/constants.ts`
- Scoring runs on the server: user rows via the cookie-bound client (RLS), the candidate pool via the catalog client
- Route handlers and server-rendered pages the recommender needs
- Unit tests with `vitest` (the one allowed new devDependency) and an offline persona evaluation script
- Everything from earlier phases: catalog, accounts and per-user persistence, posters via `lib/tmdb-image.ts`
- Preserving all shell behavior, design tokens, and accessibility rules

**Explicitly out of scope — do not build these:**
- Any LLM or Anthropic API integration (recommendations are computed, not generated)
- Collaborative filtering or anything that reads another user's data
- `localStorage`, `sessionStorage`, app-set cookies, or any other browser persistence (sole exception: the Supabase auth session cookies managed by `@supabase/ssr`)
- Deployment, CI, Vercel config (sole exception: `image.tmdb.org` in `remotePatterns` in `next.config.ts`)

Constraints:
- `SUPABASE_SERVICE_ROLE_KEY` and `TMDB_READ_TOKEN` are server-only. Never import them into client components or prefix them with `NEXT_PUBLIC_`.
- The service role key is never used in app code (`app/`, `components/`, `lib/`, `middleware.ts`). Only `scripts/` may use it. App code talks to Supabase with the anon key, and RLS is what protects user data.
- Do not commit secrets. Only `.env.example` is tracked.
- Schema changes go through migrations, not ad-hoc edits.

If a task seems to require something out of scope, stop and flag it instead of building it.

## Hard rules

1. **No play buttons.** Nothing in the UI may imply a movie can be watched inside WatchNow. Streaming provider elements are outbound links only.
2. **Brand is "WatchNow"** everywhere — UI text, page titles, metadata, route names, mock data, alt text, README. Never "WatchNext".
3. **Ratings are 0.5–5.0 in half-star increments.** Not 1–5.
4. **`Watched` and `Rated` are independent states.** A movie can be watched but unrated. Never couple them in a single boolean.
5. **`types/movie.ts` is the data contract.** The Supabase schema and any placeholder data use its field names. Do not rename fields for convenience. Map TMDB fields to this shape at ingestion; components never see raw TMDB responses.
6. **Posters come from TMDB via `lib/tmdb-image.ts`;** the flat color block (generated deterministically from movie id) is only the fallback when `poster_path` is null.

## Design tokens — use these exact values

```
--midnight:    #040D16   page background
--navigation:  #061321   header / nav bar
--panel:       #0A1A29   card and panel surface
--raised:      #0D2235   hover / elevated surface
--electric:    #2F7BFF   primary accent, active states, CTAs
--soft-blue:   #67A1FF   secondary accent, links
--text:        #F6F8FC   primary text
--muted:       #91A1B2   secondary text
--rating:      #FFC642   stars
--border:      #18334A   1px borders
```

- Font: Inter. Headlines 700, interface 500–600, body 400.
- 8px spacing grid. All padding, margin, and gap values are multiples of 8.
- Panel radius 12–16px.
- Borders are 1px solid `--border`.

## Responsive rules

| Breakpoint | Gutters | Cards/row | Nav |
|---|---|---|---|
| Desktop 1200+ | 72px | 5–7 | Full header with search |
| Tablet 768–1199 | 32px | 3–4 | Search collapses to icon |
| Mobile <768 | 16px | 2 | Bottom navigation |

## Accessibility — required, not optional

- WCAG AA contrast
- Visible focus rings in `--electric`
- Selection state never communicated by color alone (add a check, border, or label)
- Keyboard navigable throughout
- `prefers-reduced-motion` respected
- Touch targets minimum 44px
- Text alternatives for any chart

## Definition of "shell" (phase complete)

Every page is a finished-looking container with placeholder contents. Navigation works. Components render in every visual state. Nothing computes anything. A visitor should be able to click through all five pages and see what the app will look like, while no real logic exists underneath. This holds as the baseline during the data, accounts and recommender phases: real data and signed-out or brand-new-user states must not break any shell state.

## Working style

- Build components once in `components/` and reuse. No page-specific variants without a defined state.
- Small, verifiable steps. After each numbered build step, stop and report what changed.
- Do not refactor files outside the current step's scope.
- TypeScript strict mode. No `any`.
