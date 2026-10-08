# WatchNow — Project Guardrails

## What this is

WatchNow is a movie discovery and recommendation web app built for CSC 371 at Wake Forest. Users do not watch movies here. The app helps them discover, rate, and decide what to watch.

Design spec: `docs/design-spec.pdf`
Reference screenshot: `docs/rate-page-screenshot.png`

## Current phase: ACCOUNTS (Supabase Auth + per-user persistence)

The shell is complete and the catalog is live in Supabase (populated from TMDB). We are now adding user accounts so ratings, watched state and the watchlist persist per user.

**In scope:**
- Supabase Auth with email + password (no magic links, no OAuth), via `@supabase/ssr` cookie sessions and a `middleware.ts` that refreshes them
- Gating `/rate`, `/recommend` and `/for-you` behind a session (Home and Search stay public)
- Supabase migrations for `profiles` and `user_movies`, protected by row-level security
- Per-user persistence of ratings, watched, watchlist and not-interested state (optimistic UI with rollback)
- The real display name and counts on For You; deleting `lib/placeholder-data.ts`
- Everything from the data phase: catalog reads from Supabase, server-only TMDB ingestion, posters via `lib/tmdb-image.ts`
- Preserving all shell behavior, design tokens, and accessibility rules

**Explicitly out of scope — do not build these:**
- Any recommendation scoring logic
- Any LLM or Anthropic API integration
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

Every page is a finished-looking container with placeholder contents. Navigation works. Components render in every visual state. Nothing computes anything. A visitor should be able to click through all five pages and see what the app will look like, while no real logic exists underneath. This holds as the baseline during the data and accounts phases: real data and signed-out or brand-new-user states must not break any shell state.

## Working style

- Build components once in `components/` and reuse. No page-specific variants without a defined state.
- Small, verifiable steps. After each numbered build step, stop and report what changed.
- Do not refactor files outside the current step's scope.
- TypeScript strict mode. No `any`.
