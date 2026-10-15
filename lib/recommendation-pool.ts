import type { SupabaseClient } from "@supabase/supabase-js";
import { POOL_PAGE_SIZE, POOL_SIZE } from "@/lib/recommender/constants";
import type { Database } from "@/types/database";
import type { RecMovie } from "@/types/movie";

/**
 * Queries for the recommender's inputs. Takes the client as a parameter (no
 * "server-only") so scripts/eval-personas.ts can reuse it; app code calls it
 * through lib/recommendations.ts with the anon-key catalog client.
 */

const REC_COLUMNS =
  "id, title, genres, keywords, director, top_cast, vote_average, vote_count, popularity, runtime_min, poster_path, backdrop_path, release_year";

/** Max ids per `in` filter, to keep the request URL short. */
const IDS_PER_QUERY = 100;

type Client = SupabaseClient<Database>;

/** The POOL_SIZE most-voted movies, paged past PostgREST's 1000-row cap. */
export async function fetchPool(client: Client): Promise<RecMovie[]> {
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(POOL_SIZE / POOL_PAGE_SIZE) }, (_, page) => {
      const from = page * POOL_PAGE_SIZE;
      const to = Math.min(POOL_SIZE, from + POOL_PAGE_SIZE) - 1;
      return client
        .from("movies")
        .select(REC_COLUMNS)
        .order("vote_count", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to);
    }),
  );
  return pages.flatMap((result) => {
    if (result.error) throw new Error(`Pool query failed: ${result.error.message}`);
    return result.data;
  });
}

/** Recommender columns for specific movies (the user's movies outside the pool). */
export async function fetchFeatureMovies(client: Client, ids: readonly number[]): Promise<RecMovie[]> {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_QUERY) chunks.push(ids.slice(i, i + IDS_PER_QUERY));
  const results = await Promise.all(
    chunks.map((chunk) => client.from("movies").select(REC_COLUMNS).in("id", chunk)),
  );
  return results.flatMap((result) => {
    if (result.error) throw new Error(`Feature query failed: ${result.error.message}`);
    return result.data;
  });
}
