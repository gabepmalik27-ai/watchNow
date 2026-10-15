# How WatchNow recommends movies

WatchNow's recommender is **content-based** and **deterministic**. It learns what a user likes from the movies they have rated, watched, watchlisted or dismissed, and scores every candidate by how much it shares with those movies: keywords, genres, director and cast. It also folds in overall quality and how mainstream or niche the user's taste is.

No LLM is involved, and no other user's data is read. The same inputs always produce the same output.

- **Code:** `lib/recommender/` holds pure functions with no I/O, no React and no clock. Every number lives in `lib/recommender/constants.ts`.
- **Runs on:** the server (`lib/recommendations.ts`). The user's rows are read with their session (RLS) and the candidate pool with the anon catalog client.
- **Used by:**
  - For You (server-rendered)
  - Home's "Recommended for you" row (`GET /api/recommend`)
  - Recommend (`POST /api/recommend`)
- **Check it:** `npm test` runs the unit tests. `npm run eval` runs four personas against the live catalog. `npm run eval -- --detail=<id>` prints every intermediate number for one result.

---

## 1. The formula in plain words

### Step 1: Build a taste profile from the user's own rows

1. **Find the user's baseline.** Take the average of their ratings, but pull it toward 3.5 as if they had also given two extra 3.5★ ratings:
   `mu = (sum of ratings + 7) / (number of ratings + 2)`.
   A brand-new user's baseline is 3.5. A user who rated two movies 5★ has a baseline of 4.25, not 5.
2. **Turn each touched movie into a weight `w`.** Rules are checked in this order, and the first match wins:
   - **Rated:** `(rating − mu) − 0.5 × offset` (see the next step). Above your baseline is positive, below is negative.
   - **Not interested:** −1.0
   - **Watched but not rated:** +0.3
   - **On the watchlist:** +0.5
3. **Adjust ratings for surprise.** A rating that agrees with a movie's reputation says less about you than one that doesn't. Loving The Godfather is what nearly everyone does; loving a poorly reviewed cult film, or shrugging at a classic, is distinctive.
   - A movie's **reputation** is its crowd score on the 5-star scale minus the catalog's average: `movie_avg5 − catalog_avg5`. Here `movie_avg5` is the same vote-weighted rating used for quality, divided by 2, and `catalog_avg5` is the pool's average divided by 2.
   - The **offset** is that reputation *relative to the average reputation of everything you rated*. If all your favourites are acclaimed, none of them is penalized for it; only the ones more (or less) acclaimed than your usual are.
   - Rated weight = `(rating − mu) − 0.5 × offset`. Watched, watchlist and not-interested weights don't change.
   - This only reweights your own ratings. It never pushes a candidate you wouldn't like; finding films you might not have heard of stays the job of rarity and the Discovery slider.
4. **Fade old signals.** Multiply `w` by `0.5^(days since updated_at / 180)`. Something you did six months ago counts half as much.
5. **Cap any single movie's influence.** Clamp `w` to the range −1.5 … +1.5. No single movie can outweigh several others. Without this, a generous rater's rare 1★ (often −3 or worse against their baseline) would erase a whole genre.
6. **Score every trait.** For each keyword, genre, director and cast member that appears in your movies:
   `A[trait] = (sum of w over your movies with that trait) / (number of those movies + 2)`.
   - The `+ 2` keeps a trait seen once from looking as certain as one seen ten times.
   - Cast members get half the movie's weight, and only the first 3 billed count.
   - Traits you've never touched score 0.
7. **Measure how mainstream you are.** `pUser` is the average popularity percentile (0 = least popular, 1 = most popular in the pool) of the movies you weighted positively. It's 0.5 if there are none.

### Step 2: Score each candidate

**Candidates** are the 2000 most-voted movies in the catalog, minus anything the user rated, watched, watchlisted or dismissed.

For each candidate:

| Feature | Raw value | Then |
|---|---|---|
| **keyword** | sum of `A` over its keywords ÷ √(number of keywords) | rescaled to 0–1 across all candidates (min → 0, max → 1) |
| **genre** | average `A` over its genres | rescaled to 0–1 across all candidates |
| **people** | `A[director]` + average `A` over its top-3 cast | rescaled to 0–1 across all candidates |
| **quality** | a vote-weighted rating: `WR = v/(v+1000)·R + 1000/(v+1000)·C`, where `R` is its TMDB average, `v` its vote count and `C` the pool average | mapped 5 → 0 … 9 → 1, clamped |
| **rarity** | `1 − |its popularity percentile − target|` | already 0–1 |
| **context** (Recommend only) | see Step 3 | already 0–1 |

`√(number of keywords)` rewards many matching keywords without letting a movie with 60 keywords win just by having more of them.

**Score** = the weighted sum of the features. The weights always add up to 1, so a score is between 0 and 1.

| Feature | For You / Home | Recommend |
|---|---|---|
| context | — | 0.40 |
| keyword | 0.35 | 0.15 |
| genre | 0.25 | 0.12 |
| people | 0.15 | 0.08 |
| quality | 0.15 | 0.15 |
| rarity | 0.10 | 0.10 |

- **Rarity target:** `pUser` on For You. On Recommend it's `1 − discovery/100`, so Safe Pick aims at the most popular movies and Surprise Me at the least popular.
- **Cold start.** With fewer than 3 ratings there is no taste to match yet. keyword, genre and people drop to 0 and the rest are scaled back up to sum to 1. For You becomes 0.60 quality + 0.40 rarity.
- **No context.** On Recommend with no mood or experience chosen, context drops to 0 and is redistributed the same way.
- **Ties:** sorted by score, then quality, then movie id, so equal scores always come out in the same order.
- **Diversity:** For You and Home show at most 2 movies per director. Lower-ranked movies fill the gaps.

### Step 3: Context on the Recommend page

- **Time is a hard filter, not a preference.** "<90" keeps runtime ≤ 90 min, "90–120" keeps 90–120, "2+ hours" keeps ≥ 120. A movie with an unknown runtime is dropped whenever a time is chosen.
- **Mood and Experience** each map to a set of genres and a few TMDB keywords:

  | | Genres | Keywords | Penalized genres |
  |---|---|---|---|
  | Funny | Comedy, Animation, Family | parody, satire, slapstick comedy, buddy comedy | — |
  | Exciting | Action, Adventure, Thriller, Science Fiction | heist, car chase, superhero, chase | — |
  | Relaxing | Comedy, Family, Animation, Romance, Documentary | feel-good, friendship, road trip | Horror, War, Thriller |
  | Easy | Comedy, Family, Animation, Romance | feel-good, coming of age | — |
  | Engaging | Drama, Mystery, Science Fiction, History | twist ending, plot twist, based on true story, philosophy | — |
  | Intense | Thriller, Horror, War, Crime | survival, serial killer, revenge, psychological thriller | — |

- **contextMatch.** For each chosen dimension (mood, experience), count the movie's matching genres, plus 1 if any listed keyword matches. Two hits make a full match: `match = min(1, hits / 2)`. Average the chosen dimensions, subtract 0.5 for each penalized genre the movie has, and clamp to 0–1.

### Step 4: One reason per result

The first rule that applies wins:

1. **Context outweighs taste.** If context contributed at least as much as keyword + genre + people combined, show the chosen context, e.g. "Under 90 min · Funny".
2. **Cold start:** "Popular and highly rated".
3. **Best anchor.** Among the movies you rated above your baseline, find the one sharing the most positively-scored keywords and genres with the candidate.
   - If you rated it at least 1 star above its crowd score **and** its reputation is below the catalog average (an under-appreciated film you loved), show "You rated {title} higher than most viewers".
   - Otherwise show "Because you loved {title}: {its two best shared keywords}", padded with shared genres if needed.
4. **Fallback:** "Matches your taste for {your best-liked genre on this movie}", or the cold-start text if there is none.

Every result also carries its full score breakdown. Open Recommend with `?debug=1` to see it under each result.

Every list also carries `diagnostics`: how many results were requested and returned, the pool size, and where the rest went (already rated/watched/watchlisted/dismissed, outside the time filter, skipped by the director cap, missing from the catalog). `?debug=1` on Recommend and on For You shows it, so a short list explains itself.

---

## 2. Every constant and why it has that value

| Constant | Value | Why |
|---|---|---|
| `MU_PRIOR` | 3.5 | The midpoint of 0.5–5 is 2.75, but people mostly rate movies they chose to watch, so typical ratings sit higher. 3.5 is a neutral "liked it fine". |
| `MU_PRIOR_COUNT` | 2 | Enough to stop one or two ratings from defining the baseline (one 5★ alone would make every later 5★ count as "average"), and small enough to fade after ~10 ratings. |
| `WEIGHT_WATCHED_UNRATED` | +0.3 | Choosing to watch something is a mild positive signal, weaker than a rating a full star above the baseline (+1). |
| `WEIGHT_WATCHLIST` | +0.5 | Actively saving a movie expresses interest, but it hasn't been confirmed by watching. It's stronger than a passive "watched" yet below a clearly liked rating. |
| `WEIGHT_NOT_INTERESTED` | −1.0 | An explicit "no" is as strong as rating a movie one star below your baseline. |
| `SURPRISE_BETA` | 0.5 | How much a movie's relative reputation moves a rating's weight. The offsets are small: reputations in the catalog run from −1.43 to +0.82 stars, so at 0.5 the surprise term is rarely more than ±0.4, while `rating − mu` spans several stars. That's enough to rank a distinctive love above a conventional one without overriding what the user said. Loved classics keep most of their weight ("0.5 keeps loved classics meaningful"), and with offsets measured against the user's own average, a fan of acclaimed films loses nothing at all. At 1.0 the surprise term could flip a 4★ into a negative. |
| `CROWD_GAP_REASON_STARS` | 1 | "Higher than most viewers" should mean a real disagreement: a full star above the crowd. It also requires a below-average reputation. Without that, any 5★ on a film averaging 8.0/10 or less qualified, which was most 5★ ratings (7 of the comedy persona's 10 reasons) and replaced the more specific "Because you loved". |
| `WEIGHT_CLIP` | 1.5 | Weights are clamped to ±1.5 after decay. A full star above the baseline (+1) passes untouched, and so do the fixed signals (±1, +0.5, +0.3). Only outliers are cut: a 1★ from someone whose baseline is 4+ would otherwise be −3 or worse and cancel three or more loved movies sharing a genre. With the clamp, the eval's sci-fi persona keeps a positive Science Fiction affinity (0.22 instead of 0.09). |
| `RECENCY_HALF_LIFE_DAYS` | 180 | Taste drifts slowly. Six months keeps last year's favourites relevant while letting this month's ratings lead. |
| `AFFINITY_PSEUDO_COUNT` | 2 | The same idea as the mean prior: a trait seen in one movie gets 1/3 of that movie's weight, not all of it, so single coincidences don't dominate. |
| `CAST_WEIGHT` | 0.5 | Actors appear in very different films, so sharing an actor says less about a movie than sharing a director or keyword. |
| `TOP_CAST_COUNT` | 3 | Leads shape a film; the 5th-billed actor rarely does. |
| `DEFAULT_RARITY_PREFERENCE` | 0.5 | With no evidence about mainstream vs niche taste, aim at the middle of the pool. |
| `BAYES_MIN_VOTES` (m) | 1000 | A movie needs about 1000 votes before its own average counts as much as the pool average. That keeps 9.0-with-300-votes from beating 8.5-with-30,000. In the pool the fewest votes is 2,915 and the median 5,280 (as of 2026-10-08), so m damps the least-voted movies by about a quarter without flattening the rest. |
| `QUALITY_FLOOR` / `QUALITY_CEIL` | 5 / 9 | 99.85% of pool movies have a weighted rating between 5 and 9 on TMDB's 0–10 scale (actual range 4.74–8.65). Mapping that band to 0–1 uses nearly the whole range. |
| `FOR_YOU_WEIGHTS` | .35 / .25 / .15 / .15 / .10 | Keywords are the most specific taste signal (themes, settings, tone), then genres (broad), then people (strong but sparse). Quality guards against obscure misses. Rarity nudges toward the user's mainstream/niche comfort zone without overriding taste. |
| `RECOMMEND_WEIGHTS` | context .40, then .15 / .12 / .08 / .15 / .10 | On Recommend the user is telling us what they want right now, so context leads. Taste features keep their relative order at lower weight. Quality and rarity keep their For You weight. |
| `COLD_START_MIN_RATINGS` | 3 | With fewer than 3 ratings, min-max normalization turns noise from one or two movies into full-range scores. Below 3 it's more honest to rank by quality. |
| `PERSONALIZE_PROMPT_RATINGS` | 5 | Personalization switches on at 3, but it's still thin. Prompting until 5 gets the user to a more stable profile. |
| `MAX_PER_DIRECTOR` | 2 | Stops one loved director from filling a whole row (e.g. six Nolan films). |
| `POOL_SIZE` / `POOL_PAGE_SIZE` | 2000 / 1000 | 2000 well-known movies is large enough for variety and small enough to cache (≈ 1.24 MB, under Next's 2 MB data-cache limit). PostgREST returns at most 1000 rows per request. |
| `FOR_YOU_LIMIT` | 20 | A scrollable row for For You and Home. |
| `RECOMMEND_RESULT_COUNT` / `RECOMMEND_MAX_RESULTS` | 10 / 30 | Recommend shows 10; "Show more" asks for 10 more, up to 30. Scoring is deterministic, so a larger count extends the same list rather than reshuffling it. |
| `CONTEXT_HITS_FOR_FULL_MATCH` | 2 | Movies carry ~2–4 genres. Requiring 2 hits for a full match means one matching genre counts as "partly fits" and two as "fits". |
| `CONTEXT_PENALTY_PER_GENRE` | 0.5 | One clashing genre (Relaxing + Horror) cancels half a match; two cancel everything. |
| `DISCOVERY_MIN/MAX/DEFAULT` | 0 / 100 / 50 | The slider's range; the default is balanced. |
| `EXPLAIN_SHARED_TERMS` | 2 | Two concrete shared terms are specific enough to be convincing and short enough for a card. |

---

## 3. Worked example: Gravity for the sci-fi persona

Reproduce with `npm run eval -- --detail=49047`. The numbers depend on the catalog as seeded (2026-10-08); a reseed changes popularity and vote counts. Values are shown to 4 decimals, so the last digit can differ by rounding.

**The persona** ("Cerebral sci-fi fan", all ratings made "now", so no decay):
Interstellar 5, Arrival 5, Blade Runner 2049 4.5, Inception 4.5, 2001: A Space Odyssey 5, Ex Machina 4.5, Contact 4, Annihilation 4, The Martian 4, Transformers 1.

### Step 1: Profile

- `mu = (41.5 + 7) / (10 + 2) = 48.5 / 12 = 4.0417`
- `catalog_avg5 = 7.0042 / 2 = 3.5021`
- **Reputations.** `movie_avg5` is the vote-weighted rating ÷ 2, and reputation = movie_avg5 − 3.5021. Their mean over the 10 rated movies is 2.9341 / 10 = **0.2934**: this user mostly rates well-regarded films.
- **Weights:** `w = clamp((rating − mu) − 0.5 × (reputation − 0.2934), ±1.5)`.

  | Movie | Rating | movie_avg5 | Reputation | Offset | rating − mu | w |
  |---|---|---|---|---|---|---|
  | Interstellar | 5 | 4.2324 | 0.7303 | 0.4369 | 0.9583 | 0.9583 − 0.2185 = **0.7399** |
  | Arrival | 5 | 3.7858 | 0.2837 | −0.0097 | 0.9583 | **0.9632** |
  | Blade Runner 2049 | 4.5 | 3.7823 | 0.2802 | −0.0132 | 0.4583 | **0.4650** |
  | Inception | 4.5 | 4.1831 | 0.6810 | 0.3876 | 0.4583 | **0.2645** |
  | 2001: A Space Odyssey | 5 | 3.9645 | 0.4624 | 0.1690 | 0.9583 | **0.8738** |
  | Ex Machina | 4.5 | 3.7810 | 0.2789 | −0.0145 | 0.4583 | **0.4656** |
  | Contact | 4 | 3.7101 | 0.2080 | −0.0854 | −0.0417 | **0.0010** |
  | Annihilation | 4 | 3.2736 | −0.2285 | −0.5219 | −0.0417 | −0.0417 + 0.2610 = **0.2193** |
  | The Martian | 4 | 3.8348 | 0.3327 | 0.0393 | −0.0417 | **−0.0613** |
  | Transformers | 1 | 3.4075 | −0.0946 | −0.3880 | −3.0417 | −2.8477, **clamped to −1.5000** |

  - Inception and Interstellar are this user's most acclaimed picks, so their weights shrink the most.
  - Annihilation is a weaker-reviewed film the user still gave 4★, so it turns from a faint negative into a positive.
  - Transformers is the only weight beyond ±1.5, so it's the only one the clamp changes.
- **Gravity's keywords** (`A = Σw / (count + 2)`):

  | Keyword | Carried by | A |
  |---|---|---|
  | astronaut | Interstellar, 2001, The Martian | (0.7399 + 0.8738 − 0.0613) / 5 = **0.3105** |
  | space station | Interstellar, 2001 | 1.6137 / 4 = **0.4034** |
  | space | Interstellar, The Martian | 0.6786 / 4 = **0.1696** |
  | space mission | 2001 | 0.8738 / 3 = **0.2913** |
  | hopeful | Arrival | 0.9632 / 3 = **0.3211** |
  | loss | Arrival | 0.9632 / 3 = **0.3211** |
  | reflective | none | **0** |
  | trapped in space | none | **0** |

- **Gravity's genres:**
  - Drama is carried by Interstellar, Arrival, BR2049, Ex Machina, Contact and The Martian:
    `(0.7399 + 0.9632 + 0.4650 + 0.4656 + 0.0010 − 0.0613) / (6 + 2) = 2.5734 / 8 = 0.3217`.
  - Science Fiction is carried by all 10, Transformers included:
    `(sum of all ten weights) / 12 = 2.4310 / 12 = 0.2026`.
  - Thriller: no rated movie, **0**.
- **People:** Alfonso Cuarón, Sandra Bullock, George Clooney and Ed Harris appear in none of the rated movies, so all are 0.
- **`pUser = 0.8087`.** The persona's positively weighted movies are mostly very popular ones. Annihilation and Contact now count as positive too, which lowers it from 0.89.

### Step 2: Features

| Feature | Raw | Pool min / max | Feature value |
|---|---|---|---|
| keyword | (0.3105 + 0.3211 + 0.3211 + 0 + 0.1696 + 0.2913 + 0.4034 + 0) / √8 = 1.8170 / 2.8284 = **0.6424** | −0.5944 / 0.6424 | Gravity *is* the max, so **1.0000** |
| genre | (0.3217 + 0.2026 + 0) / 3 = **0.1748** | −0.1544 / 0.3446 | (0.1748 + 0.1544) / (0.3446 + 0.1544) = 0.3292 / 0.4990 = **0.6596** |
| people | 0 + 0 = **0** | −0.6667 / 0.3829 | 0.6667 / 1.0496 = **0.6352** |
| quality | R = 7.2, v = 16 736, C = 7.0042: WR = (16736 / 17736)·7.2 + (1000 / 17736)·7.0042 = 6.7940 + 0.3949 = **7.1890** | maps 5 → 0, 9 → 1 | (7.1890 − 5) / 4 = **0.5472** |
| rarity | Gravity's popularity percentile = 0.6093; target = pUser = 0.8087 | — | 1 − 0.1994 = **0.8007** |

### Score

Not cold start (10 ratings) and no context, so the For You weights apply unchanged:

| Feature | Weight × value | Contribution |
|---|---|---|
| keyword | 0.35 × 1.0000 | 0.3500 |
| genre | 0.25 × 0.6596 | 0.1649 |
| people | 0.15 × 0.6352 | 0.0953 |
| quality | 0.15 × 0.5472 | 0.0821 |
| rarity | 0.10 × 0.8007 | 0.0801 |
| **Score** | | **0.7723** (0.7724 from the rounded contributions) |

Gravity is the persona's #1 result.

### Reason

Among the anchors (movies with w > 0 that were rated), Interstellar has the largest overlap with Gravity: space station 0.4034 + astronaut 0.3105 + space 0.1696 + Drama 0.3217 + Science Fiction 0.2026 = 1.4078. Next is 2001 at 1.2078 (no Drama), then Arrival at 1.1665.

Interstellar's reputation is +0.73, well above average, so the crowd-gap wording doesn't apply. Its two best shared keywords are space station (0.4034) and astronaut (0.3105).
→ **"Because you loved Interstellar: space station, astronaut"**

---

## 4. Behaviours worth knowing

- **Outliers are capped, not ignored.** Before `WEIGHT_CLIP`, the sci-fi persona's single Transformers 1★ (w −3.04) cut Science Fiction to 0.09. Its top 10 drifted to acclaimed dramas: **3/10 sci-fi**. With the clamp, the 1★ still counts (−1.5, the strongest negative allowed) but can't outvote the loved films. Science Fiction is 0.22 and the top 10 is **7/10 sci-fi**, led by Gravity. The remaining three (Dead Poets Society, 12 Angry Men, One Flew Over the Cuckoo's Nest) come from Drama, which six of the loved films share.
- **Surprise weights reward distinctive opinions, measured against the user's own taste.** The first version measured reputation against the catalog only. That shrank every love of a fan of acclaimed films: Interstellar fell from +0.96 to +0.59, the 1★ outlier dominated again, and the sci-fi persona dropped from 7/10 to 4/10 sci-fi. Measuring against the user's own average keeps that persona at 7/10, while the contrarian's cult loves still count fully. In the eval, each persona's top 10 shares 9 of 10 titles with the pre-surprise version:
  - Sci-fi: 12 Angry Men → The Passion of the Christ, a weak Drama-driven pick at #9.
  - Comedy: The Good Dinosaur → Paddington.
  - Horror: Nightcrawler → Insidious: Chapter 2.
  - Contrarian: Demon Slayer → Guardians of the Galaxy.

  "You rated … higher than most viewers" appears only for the contrarian, on all 10 of its results: Hackers, Mandy, Jupiter Ascending, Speed Racer.
- **Features are relative to the candidate set.** Min-max rescaling means a feature value says "how this compares with the other candidates", not an absolute strength. When a few movies score very negatively (sequels to a hated movie), an unrelated movie sits around 0.7 rather than 0. That's why Gravity's people feature is 0.62 even though nothing matched.
- **A generous rater's 4★ is slightly negative,** because it is below their own baseline. Ratings are read relative to the user, not the scale.
- **"Niche" means niche among the 2000 most-voted movies.** Surprise Me finds lesser-known films within well-known ones, not obscurities.
- **Recommend has no director cap.** Context already varies the list. With "Show more" reaching 30 results, a cap may become worth adding.
- **For You is computed per request.** A rating made on For You removes that movie from the row immediately (client-side), and the full list re-scores on the next visit.

## 5. Tests and evaluation

- **`npm test`** (vitest): 61 recommender tests in `lib/recommender/__tests__/`, plus the For You chart stats. They cover:
  - mean shrinkage, weight rules, recency and the ±1.5 weight clamp
  - surprise weights: the spec values (+0.475, +1.15, −1.55 before the clamp, −1.5 after), decay before the clamp, offsets relative to the user's own ratings, and the crowd-gap reason
  - the Interstellar/Martian/Transformers case
  - 8 sci-fi films at 5★ plus a 1★ keep Science Fiction clearly positive
  - cast handling and the popularity percentile
  - normalization and the Bayesian rating
  - cold-start renormalization
  - the hard runtime filter, context matching and the director cap
  - explanations
  - determinism: shuffled inputs give an identical output
- **`npm run eval`:** four personas, each with 10–12 ratings on real catalog ids:
  - sci-fi, comedy/animation and horror/thriller
  - a contrarian who rates six acclaimed classics 3★ and six cult films 5★

  It prints each top 10 with breakdowns, reasons, mean popularity and mean quality, and fails if any two lists share more than 2 titles. As of 2026-10-15 the overlap is 0 for every pair. `--json=<path>` writes the lists for before/after comparisons.
