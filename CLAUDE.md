# WatchNow — Project Guardrails

## What this is

WatchNow is a movie discovery and recommendation web app built for CSC 371 at Wake Forest. Users do not watch movies here. The app helps them discover, rate, and decide what to watch.

Full product spec: `docs/PROJECT_SPEC.md`
Visual design spec: `docs/design-spec.pdf`
Reference screenshot: `docs/rate-page-screenshot.png`

## Current phase: FRONTEND SHELL ONLY

We are building the visual and navigational shell. Nothing else.

**In scope:**
- All five routes render and are reachable via global navigation
- Layout, typography, color, spacing match the design spec
- Reusable components built once and shared
- Minimal placeholder entries from `lib/placeholder-data.ts` (a hardcoded array, nothing more)
- In-session interaction state (React Context, memory only)
- Responsive behavior at three breakpoints

**Explicitly out of scope — do not build these:**
- Any database, ORM, or schema
- Any API route handlers
- Any call to TMDB or any external API
- Any authentication or user accounts
- Any recommendation scoring logic
- Any LLM or Anthropic API integration
- `localStorage`, `sessionStorage`, cookies, or any persistence
- Real poster images fetched over the network
- Deployment, CI, Vercel config, or environment variables

If a task seems to require one of the above, stop and flag it instead of building it.

## Hard rules

1. **No play buttons.** Nothing in the UI may imply a movie can be watched inside WatchNow. Streaming provider elements are outbound links only.
2. **Brand is "WatchNow"** everywhere — UI text, page titles, metadata, route names, mock data, alt text, README. Never "WatchNext".
3. **Ratings are 0.5–5.0 in half-star increments.** Not 1–5.
4. **`Watched` and `Rated` are independent states.** A movie can be watched but unrated. Never couple them in a single boolean.
5. **Placeholder data shape is a contract.** `lib/placeholder-data.ts` uses the field names in `types/movie.ts`, which mirror the eventual database schema. Do not rename fields for convenience. When real data arrives, only the import changes. This file exists so layouts have something to render — it is not a data layer, and nothing may read from it except components.
6. **Posters are flat color blocks**, generated deterministically from movie id. No network image requests.

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

## Definition of "shell"

Every page is a finished-looking container with placeholder contents. Navigation works. Components render in every visual state. Nothing computes anything. A visitor should be able to click through all five pages and see what the app will look like, while no real logic exists underneath.

## Working style

- Build components once in `components/` and reuse. No page-specific variants without a defined state.
- Small, verifiable steps. After each numbered build step, stop and report what changed.
- Do not refactor files outside the current step's scope.
- TypeScript strict mode. No `any`.
