import { RATING_VALUES } from "@/lib/rating-scale";
import type { UserMovie } from "@/types/movie";

/**
 * Aggregations behind the For You chart panels. Pure: they take the user's
 * rows and the genres of those movies and return what the charts draw.
 */

/** A genre needs this many ratings before its average is ranked (one 10/10 isn't a favourite genre). */
export const TOP_GENRES_MIN_RATINGS = 2;
/** Bars shown in each genre chart. */
export const GENRE_CHART_LIMIT = 6;
/** The rating scale, 1–10: one histogram column each. */
export const RATING_STEPS: readonly number[] = RATING_VALUES;

export type GenreAverage = { genre: string; average: number; count: number };
export type GenreCount = { genre: string; count: number };
export type RatingBucket = { rating: number; count: number };

type GenresById = ReadonlyMap<number, readonly string[]>;

/** Genres ranked by the user's average rating (≥ TOP_GENRES_MIN_RATINGS ratings each). */
export function topGenresByRating(
  userMovies: readonly UserMovie[],
  genresById: GenresById,
  limit: number = GENRE_CHART_LIMIT,
): GenreAverage[] {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const um of userMovies) {
    if (um.rating === null) continue;
    for (const genre of new Set(genresById.get(um.movie_id) ?? [])) {
      const t = totals.get(genre) ?? { sum: 0, count: 0 };
      totals.set(genre, { sum: t.sum + um.rating, count: t.count + 1 });
    }
  }
  return [...totals]
    .filter(([, t]) => t.count >= TOP_GENRES_MIN_RATINGS)
    .map(([genre, t]) => ({ genre, average: t.sum / t.count, count: t.count }))
    .sort((a, b) => b.average - a.average || b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, limit);
}

/** Genres ranked by how many watched movies carry them. */
export function genresByWatchCount(
  userMovies: readonly UserMovie[],
  genresById: GenresById,
  limit: number = GENRE_CHART_LIMIT,
): GenreCount[] {
  const counts = new Map<string, number>();
  for (const um of userMovies) {
    if (!um.watched) continue;
    for (const genre of new Set(genresById.get(um.movie_id) ?? [])) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, limit);
}

/** How many ratings fall on each value, 1 → 10 (all ten, zeros included). */
export function ratingDistribution(userMovies: readonly UserMovie[]): RatingBucket[] {
  const counts = new Map(RATING_STEPS.map((rating) => [rating, 0]));
  for (const um of userMovies) {
    if (um.rating !== null && counts.has(um.rating)) {
      counts.set(um.rating, (counts.get(um.rating) ?? 0) + 1);
    }
  }
  return RATING_STEPS.map((rating) => ({ rating, count: counts.get(rating) ?? 0 }));
}
