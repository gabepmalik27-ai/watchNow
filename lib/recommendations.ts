import "server-only";

import { unstable_cache } from "next/cache";
import { getMoviesByIds } from "@/lib/catalog";
import { fetchFeatureMovies, fetchPool } from "@/lib/recommendation-pool";
import {
  rankForContext,
  rankForYou,
  type RecommendContext,
  type RecommendationResponse,
  type RecommendationSet,
} from "@/lib/recommender";
import { FOR_YOU_LIMIT, RECOMMEND_LIMIT } from "@/lib/recommender/constants";
import { createSupabaseServerClient, getCatalogClient } from "@/lib/supabase-server";
import type { RecMovie, RecUserRow } from "@/types/movie";

/**
 * Server entry point for recommendations: loads inputs, runs the pure
 * scorer in lib/recommender/, and attaches catalog rows to the results.
 */

/** The candidate pool, cached for a day (the catalog is reseeded rarely). */
const getPool = unstable_cache(() => fetchPool(getCatalogClient()), ["rec-pool-v1"], {
  revalidate: 86400,
});

type UserInputs = { rows: RecUserRow[]; userFeatures: RecMovie[]; pool: RecMovie[] };

/** The signed-in user's rows (RLS-limited) plus the pool; null when signed out. */
async function loadInputs(): Promise<UserInputs | null> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [pool, rowsResult] = await Promise.all([
    getPool(),
    supabase
      .from("user_movies")
      .select("movie_id, watched, rating, on_watchlist, not_interested, updated_at"),
  ]);
  if (rowsResult.error) throw new Error(`user_movies query failed: ${rowsResult.error.message}`);
  const rows: RecUserRow[] = rowsResult.data.map((row) => ({
    ...row,
    rating: row.rating === null ? null : Number(row.rating),
  }));

  const inPool = new Set(pool.map((m) => m.id));
  const missing = rows.map((r) => r.movie_id).filter((id) => !inPool.has(id));
  const userFeatures = await fetchFeatureMovies(getCatalogClient(), missing);
  return { rows, userFeatures, pool };
}

/** Swaps each result's movie id for its full catalog row (overview, posters). */
async function hydrate(set: RecommendationSet): Promise<RecommendationResponse> {
  const movies = await getMoviesByIds(set.results.map((r) => r.movieId));
  const byId = new Map(movies.map((m) => [m.id, m]));
  return {
    ...set,
    results: set.results.flatMap((r) => {
      const movie = byId.get(r.movieId);
      return movie ? [{ ...r, movie }] : [];
    }),
  };
}

export async function getForYouRecommendations(
  limit: number = FOR_YOU_LIMIT,
): Promise<RecommendationResponse | null> {
  const inputs = await loadInputs();
  if (!inputs) return null;
  return hydrate(rankForYou({ ...inputs, now: new Date(), limit }));
}

export async function getContextRecommendations(
  context: RecommendContext,
): Promise<RecommendationResponse | null> {
  const inputs = await loadInputs();
  if (!inputs) return null;
  return hydrate(rankForContext({ ...inputs, context, now: new Date(), limit: RECOMMEND_LIMIT }));
}
