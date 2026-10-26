// Run with: npm run seed -- --limit 100
// Loads TMDB movies into public.movies. Safe to rerun: rows are upserted by id.
// Prints names, counts and TMDB ids only. Never prints env values.

import { createClient } from "@supabase/supabase-js";
import { fetchMovieRow, tmdb } from "@/lib/tmdb-ingest";
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

function parseLimit(argv: string[]): number {
  const index = argv.indexOf("--limit");
  if (index === -1) return 5000;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    console.error("--limit must be a positive integer");
    process.exit(1);
  }
  return value;
}

type TmdbListPage = { page: number; total_pages: number; results: { id: number }[] };

/** Recent releases first (so they exist even with low vote counts), then the most-voted catalog. */
async function collectIds(limit: number): Promise<number[]> {
  const ids = new Set<number>();
  for (const path of ["/movie/now_playing", "/movie/popular"]) {
    const page = await tmdb<TmdbListPage>(path, { page: "1" });
    for (const movie of page.results) ids.add(movie.id);
  }

  for (let page = 1; ids.size < limit && page <= DISCOVER_PAGE_LIMIT; page += 1) {
    const result = await tmdb<TmdbListPage>("/discover/movie", {
      sort_by: "vote_count.desc",
      "vote_count.gte": "200",
      include_adult: "false",
      page: String(page),
    });
    for (const movie of result.results) ids.add(movie.id);
    if (page >= result.total_pages) break;
  }

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
