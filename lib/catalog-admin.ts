import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchMovieRow, tmdb } from "@/lib/tmdb-ingest";
import type { Database, MovieInsert } from "@/types/database";
import type { SearchResult } from "@/types/movie";

/**
 * Import on search miss: when search finds nothing for a real film, fetch it
 * from TMDB and save it to public.movies for good.
 *
 * THE ONE EXCEPTION to the CLAUDE.md service-key rule. This is the only file in
 * app/, components/, lib/ or middleware.ts that may read SUPABASE_SERVICE_ROLE_KEY.
 * It is server-only, it writes only public.movies, and only rows built by
 * toRow() from TMDB data (never user input). Every other app query uses the
 * anon key and RLS.
 *
 * Both caches below live in one serverless instance's memory. They are
 * best-effort by design: a cold start or a second instance just forgets, which
 * costs one extra TMDB search, never a wrong answer.
 */

const IMPORT_MIN_VOTES = 20; // filters junk and stub entries
const IMPORT_MAX = 5; // bounds TMDB calls and writes per request
const IMPORT_TIMEOUT_MS = 4000; // total budget; search must stay fast
const MISS_CACHE_TTL_MS = 600_000; // 10 min: don't re-ask TMDB about the same dead end
const MISS_CACHE_MAX = 500; // bounds memory; the oldest entry goes first
const MIN_QUERY_LENGTH = 3; // shorter queries are too vague to import for
const LOG_QUERY_CHARS = 100;

/** Only what selectImportCandidates reads from a TMDB /search/movie result. */
export type TmdbSearchResult = {
  id: number;
  vote_count?: number | null;
  adult?: boolean;
};

/**
 * Which TMDB search results to import: enough votes to be a real film, not
 * adult, not already in the catalog. Most-voted first, ties by id, at most
 * IMPORT_MAX. Pure.
 */
export function selectImportCandidates(
  tmdbResults: readonly TmdbSearchResult[],
  existingIds: Iterable<number>,
): number[] {
  const existing = new Set(existingIds);
  const seen = new Set<number>();
  return tmdbResults
    .filter((result) => {
      if ((result.vote_count ?? 0) < IMPORT_MIN_VOTES) return false;
      if (result.adult === true) return false;
      if (existing.has(result.id) || seen.has(result.id)) return false;
      seen.add(result.id);
      return true;
    })
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0) || a.id - b.id)
    .slice(0, IMPORT_MAX)
    .map((result) => result.id);
}

/**
 * Whether a finished search warrants asking TMDB: the query is long enough and
 * the catalog had nothing, or only typo-fallback ("fuzzy") guesses. Pure.
 */
export function shouldImport(q: string, results: readonly Pick<SearchResult, "match_kind">[]): boolean {
  if (q.trim().length < MIN_QUERY_LENGTH) return false;
  return results.length === 0 || results.every((result) => result.match_kind === "fuzzy");
}

let adminClient: SupabaseClient<Database> | null = null;

/** Service-role client, created on first use. Bypasses RLS, so it stays inside this file. */
function getAdminClient(): SupabaseClient<Database> {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "catalog-admin: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set (server-only env vars; see .env.example)",
    );
  }
  adminClient = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** key → expiry (ms since epoch). Map order is insertion order, so the first key is the oldest. */
const missCache = new Map<string, number>();
const inFlight = new Map<string, Promise<number>>();

function isRecentMiss(key: string): boolean {
  const expiresAt = missCache.get(key);
  if (expiresAt === undefined) return false;
  if (expiresAt > Date.now()) return true;
  missCache.delete(key);
  return false;
}

function rememberMiss(key: string): void {
  missCache.delete(key); // re-inserting moves the key to the newest slot
  while (missCache.size >= MISS_CACHE_MAX) {
    const oldest = missCache.keys().next().value;
    if (oldest === undefined) break;
    missCache.delete(oldest);
  }
  missCache.set(key, Date.now() + MISS_CACHE_TTL_MS);
}

/** Rejects when `signal` aborts, so a hung request can't hold the caller past the deadline. */
function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

type TmdbSearchPage = { results: TmdbSearchResult[] };

async function importFromTmdb(query: string, signal: AbortSignal): Promise<number> {
  const page = await tmdb<TmdbSearchPage>(
    "/search/movie",
    { query, include_adult: "false", page: "1" },
    signal,
  );
  if (page.results.length === 0) return 0;

  const client = getAdminClient();
  const { data: existing, error: lookupError } = await client
    .from("movies")
    .select("id")
    .in("id", page.results.map((result) => result.id))
    .abortSignal(signal);
  if (lookupError) throw new Error(`existing-id lookup failed: ${lookupError.message}`);

  const ids = selectImportCandidates(
    page.results,
    (existing ?? []).map((row) => row.id),
  );
  if (ids.length === 0) return 0;

  const syncedAt = new Date().toISOString();
  const settled = await Promise.allSettled(ids.map((id) => fetchMovieRow(id, syncedAt, signal)));
  const rows = settled.flatMap((outcome): MovieInsert[] =>
    outcome.status === "fulfilled" ? [outcome.value] : [],
  );
  if (rows.length === 0) return 0;

  signal.throwIfAborted(); // never write after the deadline
  const { error: upsertError } = await client
    .from("movies")
    .upsert(rows, { onConflict: "id" })
    .abortSignal(signal);
  if (upsertError) throw new Error(`upsert failed: ${upsertError.message}`);
  return rows.length;
}

async function runImport(key: string, query: string): Promise<number> {
  const signal = AbortSignal.timeout(IMPORT_TIMEOUT_MS);
  let imported = 0;
  try {
    imported = await Promise.race([importFromTmdb(query, signal), rejectOnAbort(signal)]);
    if (imported > 0) console.log(`[catalog-admin] imported ${imported} movie(s) for "${query.slice(0, LOG_QUERY_CHARS)}"`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    console.warn(`[catalog-admin] import failed for "${query.slice(0, LOG_QUERY_CHARS)}": ${reason}`);
  }
  if (imported === 0) rememberMiss(key);
  return imported;
}

/**
 * Looks the query up on TMDB and saves up to IMPORT_MAX films the catalog
 * doesn't have. Returns how many were saved. Never throws: any failure, or the
 * IMPORT_TIMEOUT_MS budget running out, is logged and returns 0.
 */
export async function importMoviesForQuery(q: string): Promise<number> {
  const query = q.trim();
  const key = query.toLowerCase();
  if (!key) return 0;
  if (isRecentMiss(key)) return 0;

  const running = inFlight.get(key);
  if (running) return running;

  const work = runImport(key, query).finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}
