# How WatchNow recommends movies

WatchNow's recommender is **content-based** and **deterministic**. It learns what a user likes from the movies they have rated, watched, watchlisted or dismissed, and scores every candidate by how much it shares with those movies: keywords, genres, director and cast. It also folds in overall quality and how mainstream or niche the user's taste is.

No LLM is involved, and no other user's data is read. The same inputs always produce the same output.

- **Code:** `lib/recommender/` holds pure functions with no I/O, no React and no clock. Every number lives in `lib/recommender/constants.ts`.
- **Runs on:** the server (`lib/recommendations.ts`). The user's rows are read with their session (RLS) and the candidate pool with the anon catalog client.
- **Used by:**
  - For You (server-rendered)
  - Home's "Recommended for you" row (`GET /api/recommend`)
  - Recommend (`POST /api/recommend`)
- **Check it:** `npm test` runs the unit tests. `npm run eval` runs six personas against the live catalog. `npm run eval -- --detail=<id>` prints every intermediate number for one result.

---

## 0. The rating scale

Users rate on a labeled **1–10 integer scale** (`lib/rating-scale.ts`): 1 Awful, 2 Very bad, 3 Bad, 4 Below average, 5 Meh, 6 Average, 7 Good, 8 Great, 9 Excellent, 10 All-time favorite. There are no half steps.

Two numbers look like "the average" and are deliberately separate:

- `RATING_AVERAGE_ANCHOR = 6` is a **label** shown to users (the "average" marker on the rating control and the Rating Distribution chart). The team may revisit it, and changing it moves no recommendation.
- `MU_PRIOR = 7` is the rating a new user's baseline is shrunk toward. It is the exact double of the old half-star value (3.5), chosen so the move to 1–10 changes no recommendation. See [Why the move to 1–10 changed nothing](#why-the-move-to-110-changed-nothing).

TMDB's `vote_average` is already 0–10, so crowd scores and user ratings share one scale and no `/ 2` conversion remains anywhere.

---

## 1. The formula in plain words

### Step 1: Build a taste profile from the user's own rows

1. **Find the user's baseline.** Take the average of their ratings, but pull it toward 7 as if they had also given two extra ratings of 7:
   `mu = (sum of ratings + 14) / (number of ratings + 2)`.
   A brand-new user's baseline is 7. A user who rated two movies 10/10 has a baseline of 8.5, not 10.
2. **Turn each touched movie into a weight `w`.** Rules are checked in this order, and the first match wins:
   - **Rated:** `(rating − mu) − 0.5 × offset` (see the next step). Above your baseline is positive, below is negative.
   - **Not interested:** −2.0
   - **Watched but not rated:** +0.6
   - **On the watchlist:** +1.0
3. **Adjust ratings for surprise.** A rating that agrees with a movie's reputation says less about you than one that doesn't. Loving The Godfather is what nearly everyone does; loving a poorly reviewed cult film, or shrugging at a classic, is distinctive.
   - A movie's **reputation** is its crowd score minus the catalog's average: `movie_avg − catalog_avg`. Here `movie_avg` is the same vote-weighted rating used for quality (0–10), and `catalog_avg` is the pool's average vote.
   - The **offset** is that reputation *relative to the average reputation of everything you rated*. If all your favourites are acclaimed, none of them is penalized for it; only the ones more (or less) acclaimed than your usual are.
   - Rated weight = `(rating − mu) − 0.5 × offset`. Watched, watchlist and not-interested weights don't change.
   - This only reweights your own ratings. It never pushes a candidate you wouldn't like; finding films you might not have heard of stays the job of rarity and the Discovery slider.
4. **Fade old signals.** Multiply `w` by `0.5^(days since updated_at / 180)`. Something you did six months ago counts half as much.
5. **Cap any single movie's influence.** Clamp `w` to the range −3 … +3. No single movie can outweigh several others. Without this, a generous rater's rare 2/10 (often −6 or worse against their baseline) would erase a whole genre.
6. **Score every trait.** For each keyword, genre, director and cast member that appears in your movies:
   `A[trait] = (sum of w over your movies with that trait) / (number of those movies + 2)`.
   - The `+ 2` keeps a trait seen once from looking as certain as one seen ten times.
   - Cast members get half the movie's weight, and only the first 3 billed count.
   - Traits you've never touched score 0.
   - **Genres skip negative weights** (`GENRE_NEGATIVE_LEARNING = false`): a movie with `w < 0` adds nothing to a genre's sum *or* its count. Keywords, director and cast still learn from it fully. See [Volume decides how much, ratings decide which kind](#volume-decides-how-much-ratings-decide-which-kind).
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
   - If you rated it at least 2 points above its crowd score **and** its reputation is below the catalog average (an under-appreciated film you loved), show "You rated {title} higher than most viewers".
   - Otherwise show "Because you loved {title}: {its two best shared keywords}", padded with shared genres if needed.
4. **Fallback:** "Matches your taste for {your best-liked genre on this movie}", or the cold-start text if there is none.

### Step 5: Calibrate the genre mix

Scoring ranks movies one at a time, so a list can drift into whatever genre scores highest (a sci-fi fan's list sliding into acclaimed dramas). Calibration re-ranks the best candidates so the list's genre mix resembles what the user actually watches. It's described in full in [Calibration in detail](#calibration-in-detail).

### Explanations and debugging

Every result also carries its full score breakdown. Open Recommend with `?debug=1` to see it under each result.

Every list also carries `diagnostics`: how many results were requested and returned, the pool size, and where the rest went (already rated/watched/watchlisted/dismissed, outside the time filter, skipped by the director cap, missing from the catalog). `?debug=1` on Recommend and on For You shows it, so a short list explains itself.

### Calibration in detail

**The target `p(genre)`** is the genre mix of the user's history:

- Every **watched** movie counts, rated or not, **including the ones they disliked**. Users must be able to rate honestly without shrinking a genre's share of their recommendations: panning three comedies says "not those comedies", not "fewer comedies".
- A movie with `k` genres gives `1/k` to each, times the same recency decay as the profile (`0.5^(days / 180)`). The credits are normalized to sum to 1.
- **Smoothing:** `p = 0.9 · p + 0.1 · (1 / number of genres in the pool)` for every pool genre, so no genre is ruled out entirely and small histories are softened.

**The re-rank** (`lib/recommender/calibrate.ts`) is greedy:

1. Take the top **100** candidates by score (`CALIBRATION_CANDIDATES`). Calibration can reorder strong candidates; it never promotes a weak one.
2. Normalize each score by the best one: `ns = score / max score`. Min-max would stretch any gap to 0–1, so near-identical candidates would look far apart and calibration would barely move (0.60 instead of 0.70 comedy in the 75%-comedy test).
3. Fill the list one slot at a time with the candidate that maximizes
   `(1 − λ) · ns − λ · L1(p, q_after_adding)`,
   where `q` is the list's own genre mix (same `1/k` credit) and `L1 = Σ |p(g) − q(g)|` over every genre in either (0 = identical, 2 = disjoint).
4. Ties keep score order (score, then quality, then id), so **λ = 0 is exactly the score order**. The For You director cap (≤ 2) is applied inside the loop: a capped director's movies are simply not eligible.

Each slot's choice doesn't depend on how long the list will be, so asking for 20 gives the 10-item list plus 10 more. "Show more" relies on that.

| | λ | Why |
|---|---|---|
| For You / Home | 0.5 | Taste and genre balance count equally. |
| Recommend | 0.25 | Tonight's mood and genre picks should dominate; calibration only keeps the list from collapsing into one genre. |

Calibration is skipped during cold start (< 3 ratings) and when no watched movie has genres. `?debug=1` on For You and Recommend shows `p`, `q` before and after, and both L1 distances.

**Worked example.** A user has watched three comedies and one crime film. The pool has Comedy, Crime and Drama.

- Raw mix: Comedy 0.75, Crime 0.25. Smoothed: Comedy `0.9·0.75 + 0.1/3` = **0.7083**, Crime `0.9·0.25 + 0.0333` = **0.2583**, Drama **0.0333**.
- Candidates: A (Crime, 0.80), B (Crime, 0.78), C (Comedy, 0.76), D (Comedy + Drama, 0.74). λ = 0.5, list of 2. `ns` = 1, 0.975, 0.95, 0.925.
- **Slot 1:**
  - A: q = {Crime 1}, L1 = 0.7083 + 0.7417 + 0.0333 = 1.4833 → 0.5·1 − 0.5·1.4833 = **−0.2417**
  - B: same L1 → 0.4875 − 0.7417 = **−0.2542**
  - C: q = {Comedy 1}, L1 = 0.2917 + 0.2583 + 0.0333 = 0.5833 → 0.475 − 0.2917 = **+0.1833** ← picked
  - D: q = {Comedy ½, Drama ½}, L1 = 0.2083 + 0.2583 + 0.4667 = 0.9333 → 0.4625 − 0.4667 = **−0.0042**
- **Slot 2** (list so far: C):
  - A: q = {Comedy ½, Crime ½}, L1 = 0.2083 + 0.2417 + 0.0333 = 0.4833 → 0.5 − 0.2417 = **+0.2583** ← picked
  - B: same L1 → 0.4875 − 0.2417 = **+0.2458**
  - D: q = {Comedy ¾, Drama ¼}, L1 = 0.0417 + 0.2583 + 0.2167 = 0.5167 → 0.4625 − 0.2583 = **+0.2042**
- Result **C, A** instead of the score order A, B. L1 drops from 1.4833 (all crime) to 0.4833. The best crime film still makes it; the second one gives way to the comedy the user watches three times as often.

### Volume decides how much, ratings decide which kind

Genre affinity and the calibration target both learn from **how much** of a genre the user watches. Low ratings teach **which kind** to avoid through keywords, directors and cast, and never shrink the genre itself.

- **Why:** someone who watches lots of comedies and pans half of them still wants comedies, just not those. Before this rule, every 2/10 comedy lowered Comedy's genre affinity, so honest ratings pushed comedies out entirely.
- **How:** `GENRE_NEGATIVE_LEARNING = false` leaves negative-weight movies out of genre affinity (sum and count, so they can't dilute it either), and the calibration target counts every watched movie regardless of rating.

**Example: the eval's "Picky comedy fan"** watches 24 comedies. They love 12 offbeat ones (Wes Anderson, Edgar Wright, Monty Python, Lady Bird, Jojo Rabbit) at 8–10 and pan 12 broad studio ones (Grown Ups, Click, Pixels, Ted 2, The Hangover II and III) at 2–4.

| | Comedy share of top 20 (genre credit) | Comedies in top 20 |
|---|---|---|
| Genre learns from dislikes too (old) | 15% | 5 |
| Volume decides how much (now) | **48%** (target 49%) | **17** |

The recommended comedies look like the loved ones, not the panned ones. Against the 12 loved comedies they share 70 keywords, 5 directors and 3 top-3 cast members; against the 12 panned ones, 22 keywords, 0 directors and 2 cast members (Anna Faris in The Dictator, Mark Wahlberg in Daddy's Home).

---

## 2. Every constant and why it has that value

| Constant | Value | Why |
|---|---|---|
| `MU_PRIOR` | 7 | Exactly double the old half-star value (3.5), which keeps behavior identical. The midpoint of 1–10 is 5.5, but people mostly rate movies they chose to watch, so typical ratings sit higher; 7 is a neutral "liked it fine" (the "Good" label). Separate from the user-facing label anchor (6), which moves nothing. |
| `MU_PRIOR_COUNT` | 2 | Enough to stop one or two ratings from defining the baseline (one 10/10 alone would make every later 10/10 count as "average"), and small enough to fade after ~10 ratings. |
| `WEIGHT_WATCHED_UNRATED` | +0.6 | Doubled from 0.3. Choosing to watch something is a mild positive signal, weaker than a rating two points above the baseline (+2). |
| `WEIGHT_WATCHLIST` | +1.0 | Doubled from 0.5. Actively saving a movie expresses interest, but it hasn't been confirmed by watching. It's stronger than a passive "watched" yet below a clearly liked rating. |
| `WEIGHT_NOT_INTERESTED` | −2.0 | Doubled from −1.0. An explicit "no" is as strong as rating a movie two points below your baseline. |
| `SURPRISE_BETA` | 0.5 | How much a movie's relative reputation moves a rating's weight. Unitless, so it is unchanged. The offsets are small: reputations in the catalog run from −2.86 to +1.64 points, so at 0.5 the surprise term is rarely more than ±0.8, while `rating − mu` spans several points. That's enough to rank a distinctive love above a conventional one without overriding what the user said. Loved classics keep most of their weight ("0.5 keeps loved classics meaningful"), and with offsets measured against the user's own average, a fan of acclaimed films loses nothing at all. At 1.0 the surprise term could flip an 8/10 into a negative. |
| `CROWD_GAP_REASON_POINTS` | 2 | Doubled from 1 (renamed from `_STARS`). "Higher than most viewers" should mean a real disagreement: two points above the crowd. It also requires a below-average reputation. Without that, any 10/10 on a film averaging 8.0/10 or less qualified, which was most 10/10 ratings (7 of the comedy persona's 10 reasons) and replaced the more specific "Because you loved". |
| `WEIGHT_CLIP` | 3.0 | Doubled from 1.5. Weights are clamped to ±3 after decay. Two points above the baseline (+2) passes untouched, and so do the fixed signals (±2, +1, +0.6). Only outliers are cut: a 2/10 from someone whose baseline is 8+ would otherwise be −6 or worse and cancel three or more loved movies sharing a genre. With the clamp, the eval's sci-fi persona keeps a positive Science Fiction affinity (0.44 instead of 0.18). |
| `RECENCY_HALF_LIFE_DAYS` | 180 | Taste drifts slowly. Six months keeps last year's favourites relevant while letting this month's ratings lead. |
| `GENRE_NEGATIVE_LEARNING` | false | Genre affinity learns from volume; dislikes teach keywords, directors and cast instead. See [Volume decides how much, ratings decide which kind](#volume-decides-how-much-ratings-decide-which-kind). |
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
| `CALIBRATION_LAMBDA_FOR_YOU` | 0.5 | Taste and genre balance count equally on For You and Home. |
| `CALIBRATION_LAMBDA_RECOMMEND` | 0.25 | Lower, because tonight's mood and genre picks should dominate. |
| `CALIBRATION_SMOOTHING` | 0.1 | 10% of the target is spread evenly over the pool's genres, so no genre is ruled out and small histories are softened. |
| `CALIBRATION_CANDIDATES` | 100 | Calibration reorders the 100 best-scored candidates (5× a For You list), so it can rebalance without promoting weak matches. |
| `CONTEXT_HITS_FOR_FULL_MATCH` | 2 | Movies carry ~2–4 genres. Requiring 2 hits for a full match means one matching genre counts as "partly fits" and two as "fits". |
| `CONTEXT_PENALTY_PER_GENRE` | 0.5 | One clashing genre (Relaxing + Horror) cancels half a match; two cancel everything. |
| `DISCOVERY_MIN/MAX/DEFAULT` | 0 / 100 / 50 | The slider's range; the default is balanced. |
| `EXPLAIN_SHARED_TERMS` | 2 | Two concrete shared terms are specific enough to be convincing and short enough for a card. |

### Why the move to 1–10 changed nothing

Switching scales is a pure rescale: every rating, and every constant that lives in rating units, was multiplied by exactly 2, and nothing else was touched.

- **Doubled (rating units):** `MU_PRIOR` 3.5 → 7, `WEIGHT_WATCHED_UNRATED` 0.3 → 0.6, `WEIGHT_WATCHLIST` 0.5 → 1.0, `WEIGHT_NOT_INTERESTED` −1.0 → −2.0, `WEIGHT_CLIP` 1.5 → 3.0, `CROWD_GAP_REASON_POINTS` 1 → 2. The crowd score and the surprise offset used to be divided by 2 to meet half-star ratings; they now use TMDB's 0–10 value directly, which is the same doubling.
- **Left alone (unitless or already 0–10):** `MU_PRIOR_COUNT`, `AFFINITY_PSEUDO_COUNT`, `CAST_WEIGHT`, `SURPRISE_BETA` (it multiplies an offset that doubled with everything else), `RECENCY_HALF_LIFE_DAYS`, `CALIBRATION_*`, `BAYES_MIN_VOTES`, `QUALITY_FLOOR` and `QUALITY_CEIL` (they act on TMDB's own 0–10 average).
- **Why the ranking is identical:** `mu`, every `rating − mu`, every surprise term, every clamp and every fixed weight is exactly twice its old value, and decay is a multiplier. So every profile weight `w` doubles, and so does every trait affinity `Σw / (count + 2)`. Candidate scoring only uses affinities through min-max normalization (`(x − min) / (max − min)`), which cancels a common factor, and through their sign (`> 0`). Calibration and rarity never read a rating. So every feature value, score, reason and genre mix is unchanged; only the raw affinities and weights shown in `--detail` and `?debug=1` are 2× larger. Doubling is exact in floating point, so the eval output matched `scripts/eval-baseline.txt` line for line.

---

## 3. Worked example: Gravity for the sci-fi persona

Reproduce with `npm run eval -- --detail=49047`. The numbers depend on the catalog as seeded (2026-10-08); a reseed changes popularity and vote counts. Recomputed on the 1–10 scale (T29); every weight and affinity is exactly twice its half-star value and every feature, score and reason is unchanged. Values are shown to 4 decimals, so the last digit can differ by rounding.

**The persona** ("Cerebral sci-fi fan", all ratings made "now", so no decay):
Interstellar 10, Arrival 10, Blade Runner 2049 9, Inception 9, 2001: A Space Odyssey 10, Ex Machina 9, Contact 8, Annihilation 8, The Martian 8, Transformers 2.

### Step 1: Profile

- `mu = (83 + 14) / (10 + 2) = 97 / 12 = 8.0833`
- `catalog_avg = 7.0042` (the pool's mean vote, used directly)
- **Reputations.** `movie_avg` is the vote-weighted rating, and reputation = movie_avg − 7.0042. Their mean over the 10 rated movies is 5.868 / 10 = **0.5868**: this user mostly rates well-regarded films.
- **Weights:** `w = clamp((rating − mu) − 0.5 × (reputation − 0.5868), ±3)`.

  | Movie | Rating | movie_avg | Reputation | Offset | rating − mu | w |
  |---|---|---|---|---|---|---|
  | Interstellar | 10 | 8.4647 | 1.4605 | 0.8737 | 1.9167 | 1.9167 − 0.4369 = **1.4798** |
  | Arrival | 10 | 7.5716 | 0.5674 | −0.0194 | 1.9167 | **1.9264** |
  | Blade Runner 2049 | 9 | 7.5645 | 0.5603 | −0.0265 | 0.9167 | **0.9299** |
  | Inception | 9 | 8.3663 | 1.3621 | 0.7752 | 0.9167 | **0.5290** |
  | 2001: A Space Odyssey | 10 | 7.9289 | 0.9247 | 0.3379 | 1.9167 | **1.7477** |
  | Ex Machina | 9 | 7.5619 | 0.5577 | −0.0291 | 0.9167 | **0.9312** |
  | Contact | 8 | 7.4203 | 0.4161 | −0.1707 | −0.0833 | **0.0020** |
  | Annihilation | 8 | 6.5472 | −0.4570 | −1.0438 | −0.0833 | −0.0833 + 0.5219 = **0.4386** |
  | The Martian | 8 | 7.6696 | 0.6654 | 0.0786 | −0.0833 | **−0.1226** |
  | Transformers | 2 | 6.8150 | −0.1892 | −0.7760 | −6.0833 | −5.6953, **clamped to −3.0000** |

  - Inception and Interstellar are this user's most acclaimed picks, so their weights shrink the most.
  - Annihilation is a weaker-reviewed film the user still gave 8/10, so it turns from a faint negative into a positive.
  - Transformers is the only weight beyond ±3, so it's the only one the clamp changes.
- **Gravity's keywords** (`A = Σw / (count + 2)`):

  | Keyword | Carried by | A |
  |---|---|---|
  | astronaut | Interstellar, 2001, The Martian | (1.4798 + 1.7477 − 0.1226) / 5 = **0.6210** |
  | space station | Interstellar, 2001 | 3.2275 / 4 = **0.8069** |
  | space | Interstellar, The Martian | 1.3572 / 4 = **0.3393** |
  | space mission | 2001 | 1.7477 / 3 = **0.5826** |
  | hopeful | Arrival | 1.9264 / 3 = **0.6421** |
  | loss | Arrival | 1.9264 / 3 = **0.6421** |
  | reflective | none | **0** |
  | trapped in space | none | **0** |

- **Gravity's genres.** Genres skip negative weights, so The Martian (−0.1226) and Transformers (−3) are left out:
  - Drama is carried by Interstellar, Arrival, BR2049, Ex Machina and Contact:
    `(1.4798 + 1.9264 + 0.9299 + 0.9312 + 0.0020) / (5 + 2) = 5.2693 / 7 = 0.7528`.
  - Science Fiction is carried by the eight positively weighted movies:
    `7.9846 / (8 + 2) = 0.7985`. Before this rule Transformers' −3 counted, and it was 0.4052.
  - Thriller: no rated movie, **0**.
- **People:** Alfonso Cuarón, Sandra Bullock, George Clooney and Ed Harris appear in none of the rated movies, so all are 0.
- **`pUser = 0.8087`.** The persona's positively weighted movies are mostly very popular ones. Annihilation and Contact now count as positive too, which lowers it from 0.89.

### Step 2: Features

| Feature | Raw | Pool min / max | Feature value |
|---|---|---|---|
| keyword | (0.6210 + 0.6421 + 0.6421 + 0 + 0.3393 + 0.5826 + 0.8069 + 0) / √8 = 3.6340 / 2.8284 = **1.2848** | −1.1888 / 1.2848 | Gravity *is* the max, so **1.0000** |
| genre | (0.7528 + 0.7985 + 0) / 3 = **0.5171** | 0 / 0.7985 | 0.5171 / 0.7985 = **0.6476** (no genre affinity is negative any more, so the pool minimum is 0) |
| people | 0 + 0 = **0** | −1.3333 / 0.7658 | 1.3333 / 2.0991 = **0.6352** |
| quality | R = 7.2, v = 16 736, C = 7.0042: WR = (16736 / 17736)·7.2 + (1000 / 17736)·7.0042 = 6.7940 + 0.3949 = **7.1890** | maps 5 → 0, 9 → 1 | (7.1890 − 5) / 4 = **0.5472** |
| rarity | Gravity's popularity percentile = 0.6093; target = pUser = 0.8087 | — | 1 − 0.1994 = **0.8007** |

### Score

Not cold start (10 ratings) and no context, so the For You weights apply unchanged:

| Feature | Weight × value | Contribution |
|---|---|---|
| keyword | 0.35 × 1.0000 | 0.3500 |
| genre | 0.25 × 0.6476 | 0.1619 |
| people | 0.15 × 0.6352 | 0.0953 |
| quality | 0.15 × 0.5472 | 0.0821 |
| rarity | 0.10 × 0.8007 | 0.0801 |
| **Score** | | **0.7693** (0.7694 from the rounded contributions) |

After calibration, Gravity is #8 of the persona's top 10.

### Reason

Among the anchors (movies with w > 0 that were rated), Interstellar has the largest overlap with Gravity: space station 0.8069 + astronaut 0.6210 + space 0.3393 + Drama 0.7528 + Science Fiction 0.7985 = 3.3185. Next is Arrival at 2.8355 (hopeful, loss, Drama, Science Fiction), then 2001 at 2.8090 (no Drama).

Interstellar's reputation is +1.46, well above average, so the crowd-gap wording doesn't apply. Its two best shared keywords are space station (0.8069) and astronaut (0.6210).
→ **"Because you loved Interstellar: space station, astronaut"**

---

## 4. Behaviours worth knowing

- **Outliers are capped, not ignored.** Before `WEIGHT_CLIP`, the sci-fi persona's single Transformers 2/10 (w −6.08) cut Science Fiction to 0.18. Its top 10 drifted to acclaimed dramas: **3/10 sci-fi**. With the clamp, the 2/10 still counted (−3, the strongest negative allowed) but couldn't outvote the loved films: **7/10 sci-fi**, the other three from Drama.
- **Now the 2/10 teaches keywords, not genre, and calibration keeps the mix.** With genre learning from positives only, Science Fiction is 0.80 (robot and Michael Bay stay negative). Calibration then pulls the top 20 from 43% Drama to 25%, against a 22% target. The top 10 is **10/10 sci-fi**: A.I., The Prestige, Project Hail Mary, Planet of the Apes, Moon, Dune, The Thing, Gravity, The Force Awakens, Blade Runner.
- **Surprise weights reward distinctive opinions, measured against the user's own taste.** The first version measured reputation against the catalog only. That shrank every love of a fan of acclaimed films: Interstellar fell from +1.92 to +1.18, the 2/10 outlier dominated again, and the sci-fi persona dropped from 7/10 to 4/10 sci-fi. Measuring against the user's own average keeps that persona at 7/10, while the contrarian's cult loves still count fully. In the eval, each persona's top 10 shares 9 of 10 titles with the pre-surprise version:
  - Sci-fi: 12 Angry Men → The Passion of the Christ, a weak Drama-driven pick at #9.
  - Comedy: The Good Dinosaur → Paddington.
  - Horror: Nightcrawler → Insidious: Chapter 2.
  - Contrarian: Demon Slayer → Guardians of the Galaxy.

  "You rated … higher than most viewers" appears only for the contrarian, on all 10 of its results: Hackers, Mandy, Jupiter Ascending, Speed Racer.
- **Features are relative to the candidate set.** Min-max rescaling means a feature value says "how this compares with the other candidates", not an absolute strength. When a few movies score very negatively (sequels to a hated movie), an unrelated movie sits around 0.7 rather than 0. That's why Gravity's people feature is 0.62 even though nothing matched.
- **A generous rater's 8/10 is slightly negative,** because it is below their own baseline. Ratings are read relative to the user, not the scale.
- **"Niche" means niche among the 2000 most-voted movies.** Surprise Me finds lesser-known films within well-known ones, not obscurities.
- **Recommend has no director cap.** Context already varies the list. With "Show more" reaching 30 results, a cap may become worth adding.
- **For You is computed per request.** A rating made on For You removes that movie from the row immediately (client-side), and the full list re-scores on the next visit.

## 5. Tests and evaluation

- **`npm test`** (vitest): recommender tests in `lib/recommender/__tests__/`, plus the For You chart stats and the user-state rules. They cover:
  - mean shrinkage, weight rules, recency and the ±3 weight clamp
  - surprise weights: the spec values (+0.95, +2.3, −3.1 before the clamp, −3 after), decay before the clamp, offsets relative to the user's own ratings, and the crowd-gap reason
  - the Interstellar/Martian/Transformers case
  - 8 sci-fi films at 10/10 plus a 2/10 keep Science Fiction clearly positive
  - cast handling and the popularity percentile
  - normalization and the Bayesian rating
  - cold-start renormalization
  - the hard runtime filter, context matching and the director cap
  - explanations
  - determinism: shuffled inputs give an identical output
  - result diagnostics (excluded, time filter, director cap), and a larger limit extending the same list
  - calibration: the target from 30 comedies + 10 crime films, a disliked comedy still raising comedy's target, a 20-item list landing at 0.75 ± 0.1 comedy, λ = 0 equal to score order, and determinism on shuffled input
  - genre learning from volume: three 2/10 comedies don't lower Comedy affinity or its calibration share, but do push their keywords and director negative
- **`npm run eval`:** six personas on real catalog ids:
  - sci-fi, comedy/animation and horror/thriller (10 ratings each)
  - a contrarian who rates six acclaimed classics 6/10 and six cult films 10/10
  - "Comedy 30 / Crime 10": 40 watched movies, 14 of them rated
  - "Picky comedy fan": 24 comedies, half loved and half panned

  It prints each top 10 with breakdowns, reasons, mean popularity and mean quality, and each top 20's genre mix (target, score order, calibrated) with L1. For the picky fan it also reports how the recommended comedies relate to the loved vs panned ones. It fails if any two of the first four lists share more than 2 titles; the two comedy-heavy personas are meant to resemble the comedy persona, so they aren't gated. As of 2026-10-15 the overlap is 0 for every gated pair. `--json=<path>` writes the lists for before/after comparisons.
