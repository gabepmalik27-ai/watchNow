// Run with: npm run eval
//   npm run eval -- --json=<path>       also writes each persona's top-10 ids as JSON
//   npm run eval -- --detail=<movie id>  also dumps every intermediate number for
//   that movie in the first persona's list (default: its top result).
// Offline evaluation of the recommender: in-memory personas rated (or just
// watched) on real catalog ids, each ranked against the live top-2000 pool.
// Prints each persona's For You top 10 with the score breakdown, the genre
// mix of its top 20 before vs after calibration next to the target, and the
// pairwise top-10 overlap. Exits 1 if an id is missing or any two gated
// personas share more than 2 titles.
// Uses the public anon key only (catalog reads); never prints env values.

import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchFeatureMovies, fetchPool } from "@/lib/recommendation-pool";
import { rankForYou, type GenreShares, type Recommendation } from "@/lib/recommender";
import {
  FEATURES,
  FOR_YOU_WEIGHTS,
  GENRE_NEGATIVE_LEARNING,
  MAX_PER_DIRECTOR,
} from "@/lib/recommender/constants";
import {
  crowdScore,
  makePercentile,
  meanVoteAverage,
  bayesianRating,
  rawMatches,
} from "@/lib/recommender/features";
import { buildProfile, movieTraits } from "@/lib/recommender/profile";
import type { Database } from "@/types/database";
import type { RecMovie, RecUserRow } from "@/types/movie";

const TOP_N = 10;
/** The calibrated list length For You uses; the genre-mix report covers this many. */
const MIX_N = 20;
const MAX_OVERLAP = 2;
/** Fixed so every run is identical; every rating is "made" at this instant. */
const NOW = new Date("2026-10-01T00:00:00.000Z");

type Persona = {
  name: string;
  /** [TMDB id, expected title, rating]; null = watched but unrated. */
  ratings: [number, string, number | null][];
  /**
   * false leaves the persona out of the ≤ 2 overlap gate: the comedy-heavy
   * personas are meant to resemble the comedy persona.
   */
  gated?: boolean;
  /** Prints how its recommended comedies relate to its liked vs disliked ones. */
  pickyReport?: boolean;
};

const PERSONAS: Persona[] = [
  {
    name: "Cerebral sci-fi fan",
    ratings: [
      [157336, "Interstellar", 10],
      [329865, "Arrival", 10],
      [335984, "Blade Runner 2049", 9],
      [27205, "Inception", 9],
      [62, "2001: A Space Odyssey", 10],
      [264660, "Ex Machina", 9],
      [686, "Contact", 8],
      [300668, "Annihilation", 8],
      [286217, "The Martian", 8],
      [1858, "Transformers", 2],
    ],
  },
  {
    name: "Comedy / animation fan",
    ratings: [
      [862, "Toy Story", 10],
      [14160, "Up", 10],
      [150540, "Inside Out", 9],
      [354912, "Coco", 10],
      [269149, "Zootopia", 9],
      [346648, "Paddington 2", 10],
      [8363, "Superbad", 8],
      [120467, "The Grand Budapest Hotel", 9],
      [808, "Shrek", 8],
      [176, "Saw", 2],
    ],
  },
  {
    name: "Horror / thriller fan",
    ratings: [
      [493922, "Hereditary", 10],
      [419430, "Get Out", 9],
      [138843, "The Conjuring", 9],
      [694, "The Shining", 10],
      [807, "Se7en", 10],
      [274, "The Silence of the Lambs", 10],
      [447332, "A Quiet Place", 8],
      [530385, "Midsommar", 9],
      [146233, "Prisoners", 9],
      [109445, "Frozen", 2],
    ],
  },
  {
    // Rates acclaimed classics 6/10 and lower-rated cult/style films 10/10: the
    // case where a rating's distance from the movie's reputation matters most.
    name: "Contrarian",
    ratings: [
      [238, "The Godfather", 6],
      [278, "The Shawshank Redemption", 6],
      [424, "Schindler's List", 6],
      [13, "Forrest Gump", 6],
      [289, "Casablanca", 6],
      [15, "Citizen Kane", 6],
      [76757, "Jupiter Ascending", 10],
      [19994, "Jennifer's Body", 10],
      [23629, "Sucker Punch", 10],
      [460885, "Mandy", 10],
      [7459, "Speed Racer", 10],
      [10428, "Hackers", 10],
    ],
  },
  {
    // 30 comedies and 10 crime films watched (some rated, most not): the
    // calibration acceptance case. Target ≈ 0.75 comedy / 0.25 crime before smoothing.
    name: "Comedy 30 / Crime 10",
    gated: false,
    ratings: [
      [18785, "The Hangover", 8],
      [8363, "Superbad", 9],
      [137, "Groundhog Day", 9],
      [747, "Shaun of the Dead", 9],
      [22538, "Scott Pilgrim vs. the World", 8],
      [10625, "Mean Girls", 8],
      [7446, "Tropic Thunder", 8],
      [8467, "Dumb and Dumber", 7],
      [1584, "The School of Rock", 8],
      [762, "Monty Python and the Holy Grail", 9],
      [6957, "The 40 Year-Old Virgin", null],
      [195589, "Neighbors", null],
      [37735, "Easy A", null],
      [109414, "This Is the End", null],
      [114150, "Pitch Perfect", null],
      [1597, "Meet the Parents", null],
      [39513, "Paul", null],
      [1624, "Liar Liar", null],
      [4247, "Scary Movie", null],
      [2105, "American Pie", null],
      [57214, "Project X", null],
      [76493, "The Dictator", null],
      [302699, "Central Intelligence", null],
      [10201, "Yes Man", null],
      [310, "Bruce Almighty", null],
      [72105, "Ted", null],
      [19908, "Zombieland", null],
      [771, "Home Alone", null],
      [2108, "The Breakfast Club", null],
      [773, "Little Miss Sunshine", null],
      [238, "The Godfather", 9],
      [769, "GoodFellas", 9],
      [1422, "The Departed", 8],
      [500, "Reservoir Dogs", 8],
      [103, "Taxi Driver", null],
      [6977, "No Country for Old Men", null],
      [640, "Catch Me If You Can", null],
      [240, "The Godfather Part II", null],
      [101, "Léon: The Professional", null],
      [64690, "Drive", null],
    ],
  },
  {
    // Watches lots of comedies; loves the offbeat ones, pans broad studio
    // ones. Comedy should keep its share; the panned style should not return.
    name: "Picky comedy fan",
    gated: false,
    pickyReport: true,
    ratings: [
      [120467, "The Grand Budapest Hotel", 10],
      [83666, "Moonrise Kingdom", 10],
      [747, "Shaun of the Dead", 9],
      [22538, "Scott Pilgrim vs. the World", 9],
      [773, "Little Miss Sunshine", 9],
      [254320, "The Lobster", 8],
      [153, "Lost in Translation", 8],
      [7326, "Juno", 8],
      [391713, "Lady Bird", 9],
      [515001, "Jojo Rabbit", 9],
      [935, "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", 10],
      [762, "Monty Python and the Holy Grail", 9],
      [38365, "Grown Ups", 2],
      [9339, "Click", 3],
      [1824, "50 First Dates", 4],
      [257344, "Pixels", 2],
      [214756, "Ted 2", 3],
      [72105, "Ted", 4],
      [4247, "Scary Movie", 2],
      [2105, "American Pie", 3],
      [57214, "Project X", 2],
      [109439, "The Hangover Part III", 2],
      [45243, "The Hangover Part II", 3],
      [302699, "Central Intelligence", 4],
    ],
  },
];

/** Reasons produced when the anchor was rated well above its crowd score. */
const CROWD_GAP_REASON = /^You rated .+ higher than most viewers$/;

const f3 = (n: number) => n.toFixed(3);
const f4 = (n: number) => n.toFixed(4);

const pct = (share: number | undefined) => `${Math.round((share ?? 0) * 100)}%`.padStart(4);

/** Target vs before/after calibration, for genres that matter in any of the three. */
function printMix(target: GenreShares, before: GenreShares, after: GenreShares) {
  const genres = Object.keys({ ...target, ...before, ...after })
    .filter((g) => (target[g] ?? 0) >= 0.03 || (before[g] ?? 0) > 0 || (after[g] ?? 0) > 0)
    .sort((a, b) => (target[b] ?? 0) - (target[a] ?? 0) || (after[b] ?? 0) - (after[a] ?? 0));
  console.log(`  genre mix of top ${MIX_N}:      target  before  after`);
  for (const g of genres) {
    console.log(`    ${g.padEnd(18)} ${pct(target[g])}    ${pct(before[g])}   ${pct(after[g])}`);
  }
}

/** For the picky fan: do recommended comedies look like the liked or the panned ones? */
function printPickyReport(persona: Persona, results: Recommendation[], features: Map<number, RecMovie>) {
  const traitsOf = (ids: number[]) => ids.flatMap((id) => {
    const m = features.get(id);
    return m ? [movieTraits(m)] : [];
  });
  const liked = traitsOf(persona.ratings.filter(([, , r]) => r !== null && r >= 8).map(([id]) => id));
  const panned = traitsOf(persona.ratings.filter(([, , r]) => r !== null && r <= 4).map(([id]) => id));
  const set = (list: ReturnType<typeof traitsOf>, key: "keyword" | "director" | "cast") =>
    new Set(list.flatMap((t) => t[key]));
  const sets = {
    liked: { keyword: set(liked, "keyword"), director: set(liked, "director"), cast: set(liked, "cast") },
    panned: { keyword: set(panned, "keyword"), director: set(panned, "director"), cast: set(panned, "cast") },
  };
  const comedies = results.flatMap((r) => {
    const m = features.get(r.movieId);
    return m && m.genres.includes("Comedy") ? [{ title: r.title, traits: movieTraits(m) }] : [];
  });
  console.log(`  comedies in top ${MIX_N}: ${comedies.length}`);
  const tally = (side: "liked" | "panned") => {
    const s2 = sets[side];
    const kw = comedies.reduce((n, c) => n + c.traits.keyword.filter((k) => s2.keyword.has(k)).length, 0);
    const dir = comedies.filter((c) => c.traits.director.some((d) => s2.director.has(d))).length;
    const cast = comedies.filter((c) => c.traits.cast.some((a) => s2.cast.has(a))).length;
    return `keywords shared ${kw} · same director ${dir} · shared top-3 cast ${cast}`;
  };
  console.log(`    vs liked comedies:  ${tally("liked")}`);
  console.log(`    vs panned comedies: ${tally("panned")}`);
  for (const c of comedies) {
    const bad = [
      ...c.traits.director.filter((d) => sets.panned.director.has(d)),
      ...c.traits.cast.filter((a) => sets.panned.cast.has(a)),
    ];
    if (bad.length > 0) console.log(`    ! ${c.title} shares ${bad.join(", ")} with a panned comedy`);
  }
}

function rowsFor(persona: Persona): RecUserRow[] {
  return persona.ratings.map(([id, , rating]) => ({
    movie_id: id,
    rating,
    watched: true, // rated or not, every persona movie was watched
    on_watchlist: false,
    not_interested: false,
    updated_at: NOW.toISOString(),
  }));
}

function printResult(rank: number, r: Recommendation, pool: Map<number, RecMovie>) {
  const b = r.breakdown;
  const m = pool.get(r.movieId);
  console.log(
    `  ${String(rank).padStart(2)}. ${r.title} (${m?.release_year ?? "?"}) — ${f3(r.score)}  ` +
      FEATURES.filter((f) => b.weights[f] > 0)
        .map((f) => `${f} ${f3(b.features[f])}`)
        .join(" · "),
  );
  console.log(`      ${r.reason}`);
}

/** Every intermediate number for one candidate, so the docs can recompute it by hand. */
function printDetail(
  persona: Persona,
  rows: RecUserRow[],
  pool: RecMovie[],
  features: Map<number, RecMovie>,
  target: Recommendation,
) {
  const pct = makePercentile(pool.map((m) => m.popularity));
  const C = meanVoteAverage(pool);
  const profile = buildProfile(rows, features, pct, NOW, C);
  const rated = new Set(rows.map((r) => r.movie_id));
  const candidates = pool.filter((m) => !rated.has(m.id));
  const raws = candidates.map((m) => rawMatches(m, profile.affinity));
  const movie = features.get(target.movieId) as RecMovie;
  const traits = movieTraits(movie);

  console.log(`\n=== Worked example: ${persona.name} → ${movie.title} (id ${movie.id}) ===`);
  console.log(`mu = ${f4(profile.mu)}   ratedCount = ${profile.ratedCount}   pUser = ${f4(profile.pUser)}`);
  const reputationOf = (id: number) => {
    const m = features.get(id);
    return m ? crowdScore(m, C) - C : null;
  };
  const known = persona.ratings.flatMap(([id]) => {
    const r = reputationOf(id);
    return r === null ? [] : [r];
  });
  const meanReputation = known.reduce((a, b) => a + b, 0) / Math.max(1, known.length);
  console.log(`catalog_avg = C = ${f4(C)}`);
  console.log(`mean reputation of rated movies = ${f4(meanReputation)}`);
  console.log(
    "weights per rated movie: reputation = movie_avg − catalog_avg; offset = reputation − mean;" +
      " w = clamp((rating − mu) − 0.5 × offset, ±3)",
  );
  for (const [id, title, rating] of persona.ratings) {
    if (rating === null) continue;
    const m = features.get(id);
    const avg = m ? crowdScore(m, C) : null;
    const reputation = reputationOf(id);
    console.log(
      `  ${title}: rating ${rating}, R ${m?.vote_average} v ${m?.vote_count} → movie_avg ${avg === null ? "?" : f4(avg)}` +
        ` reputation ${reputation === null ? "?" : f4(reputation)}` +
        ` offset ${reputation === null ? "0" : f4(reputation - meanReputation)} → w ${f4(profile.weights.get(id) ?? 0)}`,
    );
  }
  // Which rated movies carry a trait: A[t] = Σ share·w over them / (count + 2).
  // Genre affinity skips negative weights (GENRE_NEGATIVE_LEARNING off), so
  // those carriers are marked as excluded.
  const carriers = (type: "keyword" | "genre" | "director" | "cast", value: string) =>
    persona.ratings
      .filter(([id]) => {
        const m = features.get(id);
        return m ? movieTraits(m)[type].includes(value) : false;
      })
      .map(([id, title]) =>
        type === "genre" && !GENRE_NEGATIVE_LEARNING && (profile.weights.get(id) ?? 0) < 0
          ? `(${title}: excluded, w < 0)`
          : title,
      );
  const show = (type: "keyword" | "genre" | "cast", values: string[]) =>
    values
      .map((v) => {
        const from = carriers(type, v);
        return `\n    ${v} = ${f4(profile.affinity[type].get(v) ?? 0)}${from.length ? `  ← ${from.join(", ")}` : "  (no rated movie)"}`;
      })
      .join("");
  console.log(`keywords (${traits.keyword.length}): ${show("keyword", traits.keyword)}`);
  console.log(`genres (${traits.genre.length}): ${show("genre", traits.genre)}`);
  console.log(
    `director: ${movie.director}=${f4(movie.director ? (profile.affinity.director.get(movie.director) ?? 0) : 0)}`,
  );
  console.log(`top-3 cast: ${show("cast", traits.cast)}`);
  for (const key of ["keyword", "genre", "people"] as const) {
    const values = raws.map((r) => r[key]);
    console.log(
      `raw ${key} = ${f4(target.breakdown.raw[key])}   pool min ${f4(Math.min(...values))}   max ${f4(Math.max(...values))}   → ${f4(target.breakdown.features[key])}`,
    );
  }
  const wr = bayesianRating(movie.vote_average ?? C, movie.vote_count ?? 0, C);
  console.log(
    `quality: R=${movie.vote_average} v=${movie.vote_count} C=${f4(C)} WR=${f4(wr)} → ${f4(target.breakdown.features.quality)}`,
  );
  console.log(
    `rarity: popularity=${movie.popularity} pct=${f4(target.breakdown.popularityPercentile)} target=${f4(target.breakdown.rarityTarget)} → ${f4(target.breakdown.features.rarity)}`,
  );
  console.log(
    "weights: " + FEATURES.map((f) => `${f} ${f4(target.breakdown.weights[f])}`).join(", "),
  );
  console.log(
    "contributions: " +
      FEATURES.map((f) => `${f} ${f4(target.breakdown.contributions[f])}`).join(" + ") +
      ` = ${f4(target.score)}`,
  );
  console.log(`reason: ${target.reason}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (set them in .env.local)");
    process.exit(1);
  }
  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const detailArg = process.argv.find((arg) => arg.startsWith("--detail"));
  const detailId = detailArg?.includes("=") ? Number(detailArg.split("=")[1]) : null;
  const jsonPath = process.argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length);

  const pool = await fetchPool(client);
  const poolBytes = Buffer.byteLength(JSON.stringify(pool));
  console.log(`Pool: ${pool.length} movies, ${(poolBytes / 1024 / 1024).toFixed(2)} MB as JSON (data cache limit 2 MB)`);
  console.log(
    `For You weights: ${FEATURES.filter((f) => FOR_YOU_WEIGHTS[f] > 0).map((f) => `${f} ${FOR_YOU_WEIGHTS[f]}`).join(", ")}; ≤ ${MAX_PER_DIRECTOR} per director`,
  );

  const allIds = PERSONAS.flatMap((p) => p.ratings.map(([id]) => id));
  const poolById = new Map(pool.map((m) => [m.id, m]));
  const outside = allIds.filter((id) => !poolById.has(id));
  const userFeatures = await fetchFeatureMovies(client, outside);
  const features = new Map([...userFeatures, ...pool].map((m) => [m.id, m]));

  let failed = false;
  console.log("\nPersona ids (expected → catalog title):");
  for (const persona of PERSONAS) {
    for (const [id, expected] of persona.ratings) {
      const title = features.get(id)?.title;
      const status = title === undefined ? "MISSING" : title === expected ? "ok" : `title is "${title}"`;
      if (title === undefined) failed = true;
      console.log(`  ${id} ${expected}: ${status}${poolById.has(id) ? "" : " (outside pool)"}`);
    }
  }
  if (failed) {
    console.error("\nSome persona ids are missing from the catalog.");
    process.exit(1);
  }

  const tops: { name: string; gated: boolean; ids: number[]; titles: string[] }[] = [];
  for (const persona of PERSONAS) {
    const rows = rowsFor(persona);
    // Greedy calibration doesn't depend on the list length, so the top 10 of
    // a 20-item run is exactly the 10-item list.
    const full = rankForYou({ pool, rows, userFeatures, now: NOW, limit: MIX_N });
    const { coldStart, calibration } = full;
    const results = full.results.slice(0, TOP_N);
    console.log(`\n## ${persona.name}${coldStart ? " (cold start)" : ""}`);
    results.forEach((r, i) => printResult(i + 1, r, features));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    console.log(
      `  → mean popularity pct ${f3(mean(results.map((r) => r.breakdown.popularityPercentile)))}` +
        ` · mean quality ${f3(mean(results.map((r) => r.breakdown.features.quality)))}` +
        ` · "higher than most viewers" reasons: ${results.filter((r) => CROWD_GAP_REASON.test(r.reason)).length}`,
    );
    if (calibration) {
      console.log(
        `  calibration λ ${calibration.lambda}: L1(target, top ${MIX_N}) ${f3(calibration.l1Before)} before → ${f3(calibration.l1After)} after`,
      );
      printMix(calibration.target, calibration.before, calibration.after);
    } else {
      console.log("  calibration skipped (cold start or no watched genres)");
    }
    if (persona.pickyReport) printPickyReport(persona, full.results, features);
    tops.push({
      name: persona.name,
      gated: persona.gated !== false,
      ids: results.map((r) => r.movieId),
      titles: results.map((r) => r.title),
    });
    if (detailArg && persona === PERSONAS[0]) {
      const target = detailId === null ? results[0] : results.find((r) => r.movieId === detailId);
      if (target) printDetail(persona, rows, pool, features, target);
      else console.log(`\n(--detail: id ${detailId} is not in this persona's top ${TOP_N})`);
    }
  }

  console.log("\nOverlap between top-10 lists (gated personas):");
  const gated = tops.filter((t) => t.gated);
  for (let i = 0; i < gated.length; i++) {
    for (let j = i + 1; j < gated.length; j++) {
      const shared = gated[i].ids.filter((id) => gated[j].ids.includes(id));
      const titles = shared.map((id) => features.get(id)?.title).join(", ");
      const ok = shared.length <= MAX_OVERLAP;
      if (!ok) failed = true;
      console.log(
        `  ${gated[i].name} × ${gated[j].name}: ${shared.length}${titles ? ` (${titles})` : ""} ${ok ? "ok" : `FAIL (> ${MAX_OVERLAP})`}`,
      );
    }
  }
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(tops, null, 2));
    console.log(`\nWrote top-${TOP_N} lists to ${jsonPath}`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
