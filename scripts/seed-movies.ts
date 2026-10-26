// Run with: npm run seed -- --limit 100
// Loads TMDB movies into public.movies. Safe to rerun: rows are upserted by id,
// so existing rows get fresh vote counts.
//
// Stratified: now playing + popular, then a broad base (every movie with
// BASE_MIN_VOTES+ votes), then niche buckets that add films below the base
// floor for groups the base under-represents. Floors and quotas were chosen
// from `npm run measure` (2026-10-26).
// Prints names, counts and TMDB ids only. Never prints env values.

import { createClient } from "@supabase/supabase-js";
import { fetchMovieRow, nonEnglishFilter, tmdb } from "@/lib/tmdb-ingest";
import type { Database, MovieInsert } from "@/types/database";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TMDB_READ_TOKEN",
] as const;

const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing env vars: ${missing.join(", ")} (set them in .env.local)`);
  process.exit(1);
}

const CONCURRENCY = 8;
const BATCH_SIZE = 200;
const PROGRESS_EVERY = 250;
const DISCOVER_PAGE_LIMIT = 500; // TMDB rejects page > 500
const DISCOVER_PAGE_SIZE = 20;
const DISCOVER_MAX_RESULTS = DISCOVER_PAGE_LIMIT * DISCOVER_PAGE_SIZE; // most one query can page through
const DEFAULT_LIMIT = 25000; // safety cap on the deduped total

const BASE_MIN_VOTES = 200;
// Niche buckets only take films below the base floor, so every film a quota
// admits is one the base didn't already have.
const NICHE_MIN_VOTES = 50;
const NICHE_MAX_VOTES = BASE_MIN_VOTES - 1;
const RECENT_MONTHS = 18;
const DOCUMENTARY_GENRE_ID = "99";
const ANIMATION_GENRE_ID = "16";

// Per-bucket caps, most-voted first. null = no cap beyond the floor.
// Bucket sizes measured 2026-10-26 in brackets.
const BASE_QUOTA: number | null = null; // [15,105]
const DOCUMENTARY_QUOTA: number | null = null; // [1,343 below the base floor]
const ANIMATION_QUOTA: number | null = null; // [1,668]
const NON_ENGLISH_QUOTA: number | null = 4000; // [9,926]: the only bucket over 4,000
const RECENT_QUOTA: number | null = null; // [576]

function parseLimit(argv: string[]): number {
  const index = argv.indexOf("--limit");
  if (index === -1) return DEFAULT_LIMIT;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    console.error("--limit must be a positive integer");
    process.exit(1);
  }
  return value;
}

type TmdbListPage = {
  page: number;
  total_pages: number;
  total_results: number;
  results: { id: number; vote_count: number }[];
};

type Bucket = {
  name: string;
  filter: Record<string, string>;
  minVotes: number;
  maxVotes: number | null;
  quota: number | null;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function discoverPage(
  filter: Record<string, string>,
  minVotes: number,
  maxVotes: number | null,
  page: number,
) {
  return tmdb<TmdbListPage>("/discover/movie", {
    ...filter,
    sort_by: "vote_count.desc",
    include_adult: "false",
    "vote_count.gte": String(minVotes),
    ...(maxVotes === null ? {} : { "vote_count.lte": String(maxVotes) }),
    page: String(page),
  });
}

/**
 * Splits [minVotes, maxVotes] into vote-count ranges that each fit under
 * discover's 10,000-result paging cap, highest range first, so paging them in
 * order still walks the bucket most-voted first.
 */
async function voteRanges(
  filter: Record<string, string>,
  minVotes: number,
  maxVotes: number,
): Promise<[number, number][]> {
  const { total_results } = await discoverPage(filter, minVotes, maxVotes, 1);
  if (total_results <= DISCOVER_MAX_RESULTS || minVotes === maxVotes) return [[minVotes, maxVotes]];
  const mid = Math.floor((minVotes + maxVotes) / 2);
  return [
    ...(await voteRanges(filter, mid + 1, maxVotes)),
    ...(await voteRanges(filter, minVotes, mid)),
  ];
}

/** A bucket's ids, most-voted first, up to its quota. */
async function collectBucket(bucket: Bucket): Promise<number[]> {
  let maxVotes = bucket.maxVotes;
  if (maxVotes === null) {
    // Open-ended bucket: its top vote count is the upper bound.
    const top = await discoverPage(bucket.filter, bucket.minVotes, null, 1);
    if (top.results.length === 0) return [];
    maxVotes = top.results[0].vote_count;
  }

  const quota = bucket.quota ?? Number.POSITIVE_INFINITY;
  const ids: number[] = [];
  for (const [low, high] of await voteRanges(bucket.filter, bucket.minVotes, maxVotes)) {
    if (ids.length >= quota) break;
    const first = await discoverPage(bucket.filter, low, high, 1);
    const pageCount = Math.min(
      first.total_pages,
      DISCOVER_PAGE_LIMIT,
      Math.ceil((quota - ids.length) / DISCOVER_PAGE_SIZE),
    );
    const pages: number[][] = [first.results.map((movie) => movie.id)];
    const rest = Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) => index + 2);
    await runPool(rest, CONCURRENCY, async (page) => {
      const result = await discoverPage(bucket.filter, low, high, page);
      pages[page - 1] = result.results.map((movie) => movie.id);
    });
    ids.push(...pages.flat());
  }
  return ids.slice(0, quota);
}

/**
 * Now playing + popular first (so recent releases exist even with low vote
 * counts), then the base, then each niche bucket. Deduped, in that order.
 */
async function collectIds(limit: number): Promise<number[]> {
  const ids = new Set<number>();
  for (const path of ["/movie/now_playing", "/movie/popular"]) {
    const page = await tmdb<TmdbListPage>(path, { page: "1" });
    for (const movie of page.results) ids.add(movie.id);
  }
  console.log(`  now playing + popular: ${ids.size}`);

  const today = new Date();
  const recentStart = new Date(today);
  recentStart.setMonth(recentStart.getMonth() - RECENT_MONTHS);
  const niche = { minVotes: NICHE_MIN_VOTES, maxVotes: NICHE_MAX_VOTES };
  const buckets: Bucket[] = [
    { name: `base (≥${BASE_MIN_VOTES})`, filter: {}, minVotes: BASE_MIN_VOTES, maxVotes: null, quota: BASE_QUOTA },
    { name: "Documentary", filter: { with_genres: DOCUMENTARY_GENRE_ID }, ...niche, quota: DOCUMENTARY_QUOTA },
    { name: "Animation", filter: { with_genres: ANIMATION_GENRE_ID }, ...niche, quota: ANIMATION_QUOTA },
    { name: "non-English", filter: await nonEnglishFilter(), ...niche, quota: NON_ENGLISH_QUOTA },
    {
      name: `Recent (${RECENT_MONTHS} mo)`,
      filter: {
        "primary_release_date.gte": isoDate(recentStart),
        "primary_release_date.lte": isoDate(today),
      },
      ...niche,
      quota: RECENT_QUOTA,
    },
  ];

  for (const bucket of buckets) {
    const bucketIds = await collectBucket(bucket);
    const before = ids.size;
    for (const id of bucketIds) ids.add(id);
    const range = bucket.maxVotes === null ? `≥${bucket.minVotes}` : `${bucket.minVotes}–${bucket.maxVotes}`;
    console.log(
      `  ${bucket.name} [${range} votes${bucket.quota === null ? "" : `, quota ${bucket.quota}`}]: ` +
        `${bucketIds.length} collected, ${ids.size - before} new`,
    );
  }

  console.log(`  deduped total: ${ids.size}${ids.size > limit ? ` (capped to --limit ${limit})` : ""}`);
  return [...ids].slice(0, limit);
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  // Service role bypasses RLS. It is created here and nowhere in the app.
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  console.log(`Collecting up to ${limit} TMDB ids...`);
  const ids = await collectIds(limit);
  console.log(`Fetching details for ${ids.length} movies (concurrency ${CONCURRENCY})...`);

  const syncedAt = new Date().toISOString();
  const buffer: MovieInsert[] = [];
  const skipped: number[] = [];
  const failedUpsertIds: number[] = [];
  let fetched = 0;
  let upserted = 0;

  async function flush(rows: MovieInsert[]) {
    if (rows.length === 0) return;
    const { error } = await supabase.from("movies").upsert(rows, { onConflict: "id" });
    if (error) {
      console.error(`Upsert of ${rows.length} rows failed: ${error.message}`);
      failedUpsertIds.push(...rows.map((row) => row.id));
    } else {
      upserted += rows.length;
    }
  }

  await runPool(ids, CONCURRENCY, async (id) => {
    try {
      buffer.push(await fetchMovieRow(id, syncedAt));
      fetched += 1;
    } catch (error) {
      skipped.push(id);
      console.warn(`Skipped ${id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    const done = fetched + skipped.length;
    if (done % PROGRESS_EVERY === 0) {
      console.log(`  ${done}/${ids.length} processed (${upserted} upserted so far)`);
    }
    // splice is synchronous, so two lanes can never flush the same rows.
    if (buffer.length >= BATCH_SIZE) await flush(buffer.splice(0, BATCH_SIZE));
  });
  await flush(buffer.splice(0));

  console.log("\nSeed summary");
  console.log(`  fetched:  ${fetched}`);
  console.log(`  upserted: ${upserted}`);
  console.log(`  skipped:  ${skipped.length}${skipped.length ? ` (${skipped.join(", ")})` : ""}`);
  if (failedUpsertIds.length > 0) {
    console.log(`  upsert failures: ${failedUpsertIds.length} (${failedUpsertIds.join(", ")})`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
