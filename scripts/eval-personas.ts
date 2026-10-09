// Run with: npm run eval
//   npm run eval -- --detail=<movie id>  also dumps every intermediate number for
//   that movie in the first persona's list (default: its top result).
// Offline evaluation of the recommender: three in-memory personas rated on
// real catalog ids, each ranked against the live top-2000 pool. Prints each
// persona's For You top 10 with the score breakdown and the pairwise overlap.
// Exits 1 if an id is missing or any two personas share more than 2 titles.
// Uses the public anon key only (catalog reads); never prints env values.

import { createClient } from "@supabase/supabase-js";
import { fetchFeatureMovies, fetchPool } from "@/lib/recommendation-pool";
import { rankForYou, type Recommendation } from "@/lib/recommender";
import { FEATURES, FOR_YOU_WEIGHTS, MAX_PER_DIRECTOR } from "@/lib/recommender/constants";
import {
  makePercentile,
  meanVoteAverage,
  bayesianRating,
  rawMatches,
} from "@/lib/recommender/features";
import { buildProfile, movieTraits } from "@/lib/recommender/profile";
import type { Database } from "@/types/database";
import type { RecMovie, RecUserRow } from "@/types/movie";

const TOP_N = 10;
const MAX_OVERLAP = 2;
/** Fixed so every run is identical; every rating is "made" at this instant. */
const NOW = new Date("2026-10-01T00:00:00.000Z");

type Persona = {
  name: string;
  /** [TMDB id, expected title, rating] */
  ratings: [number, string, number][];
};

const PERSONAS: Persona[] = [
  {
    name: "Cerebral sci-fi fan",
    ratings: [
      [157336, "Interstellar", 5],
      [329865, "Arrival", 5],
      [335984, "Blade Runner 2049", 4.5],
      [27205, "Inception", 4.5],
      [62, "2001: A Space Odyssey", 5],
      [264660, "Ex Machina", 4.5],
      [686, "Contact", 4],
      [300668, "Annihilation", 4],
      [286217, "The Martian", 4],
      [1858, "Transformers", 1],
    ],
  },
  {
    name: "Comedy / animation fan",
    ratings: [
      [862, "Toy Story", 5],
      [14160, "Up", 5],
      [150540, "Inside Out", 4.5],
      [354912, "Coco", 5],
      [269149, "Zootopia", 4.5],
      [346648, "Paddington 2", 5],
      [8363, "Superbad", 4],
      [120467, "The Grand Budapest Hotel", 4.5],
      [808, "Shrek", 4],
      [176, "Saw", 1],
    ],
  },
  {
    name: "Horror / thriller fan",
    ratings: [
      [493922, "Hereditary", 5],
      [419430, "Get Out", 4.5],
      [138843, "The Conjuring", 4.5],
      [694, "The Shining", 5],
      [807, "Se7en", 5],
      [274, "The Silence of the Lambs", 5],
      [447332, "A Quiet Place", 4],
      [530385, "Midsommar", 4.5],
      [146233, "Prisoners", 4.5],
      [109445, "Frozen", 1],
    ],
  },
];

const f3 = (n: number) => n.toFixed(3);
const f4 = (n: number) => n.toFixed(4);

function rowsFor(persona: Persona): RecUserRow[] {
  return persona.ratings.map(([id, , rating]) => ({
    movie_id: id,
    rating,
    watched: true,
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
  const profile = buildProfile(rows, features, pct, NOW);
  const rated = new Set(rows.map((r) => r.movie_id));
  const candidates = pool.filter((m) => !rated.has(m.id));
  const raws = candidates.map((m) => rawMatches(m, profile.affinity));
  const movie = features.get(target.movieId) as RecMovie;
  const traits = movieTraits(movie);
  const C = meanVoteAverage(pool);

  console.log(`\n=== Worked example: ${persona.name} → ${movie.title} (id ${movie.id}) ===`);
  console.log(`mu = ${f4(profile.mu)}   ratedCount = ${profile.ratedCount}   pUser = ${f4(profile.pUser)}`);
  console.log("weights w per rated movie:");
  for (const [id, title, rating] of persona.ratings) {
    console.log(`  ${title}: rating ${rating} → w ${f4(profile.weights.get(id) ?? 0)}`);
  }
  // Which rated movies carry a trait: A[t] = Σ share·w over them / (count + 2).
  const carriers = (type: "keyword" | "genre" | "director" | "cast", value: string) =>
    persona.ratings
      .filter(([id]) => {
        const m = features.get(id);
        return m ? movieTraits(m)[type].includes(value) : false;
      })
      .map(([, title]) => title);
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

  const tops: { name: string; ids: number[] }[] = [];
  for (const persona of PERSONAS) {
    const rows = rowsFor(persona);
    const { results, coldStart } = rankForYou({
      pool,
      rows,
      userFeatures,
      now: NOW,
      limit: TOP_N,
    });
    console.log(`\n## ${persona.name}${coldStart ? " (cold start)" : ""}`);
    results.forEach((r, i) => printResult(i + 1, r, features));
    tops.push({ name: persona.name, ids: results.map((r) => r.movieId) });
    if (detailArg && persona === PERSONAS[0]) {
      const target = detailId === null ? results[0] : results.find((r) => r.movieId === detailId);
      if (target) printDetail(persona, rows, pool, features, target);
      else console.log(`\n(--detail: id ${detailId} is not in this persona's top ${TOP_N})`);
    }
  }

  console.log("\nOverlap between top-10 lists:");
  for (let i = 0; i < tops.length; i++) {
    for (let j = i + 1; j < tops.length; j++) {
      const shared = tops[i].ids.filter((id) => tops[j].ids.includes(id));
      const titles = shared.map((id) => features.get(id)?.title).join(", ");
      const ok = shared.length <= MAX_OVERLAP;
      if (!ok) failed = true;
      console.log(
        `  ${tops[i].name} × ${tops[j].name}: ${shared.length}${titles ? ` (${titles})` : ""} ${ok ? "ok" : `FAIL (> ${MAX_OVERLAP})`}`,
      );
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
