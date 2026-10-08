import type { UserMovie } from "@/types/movie";

/**
 * Movies worth asking "have you seen this?" about: not watched, not dismissed,
 * not already on the watchlist.
 *
 * Stand-in until the recommender (roadmap step 6) replaces this.
 *
 * The catalog is passed in (rather than imported here) because only
 * components may read lib/placeholder-data.ts.
 */
export function getRateCandidates<T extends { id: number }>(
  movies: T[],
  userMovies: UserMovie[],
): T[] {
  const byId = new Map(userMovies.map((um) => [um.movie_id, um]));
  return movies.filter((movie) => {
    const um = byId.get(movie.id);
    return !um || (!um.watched && !um.not_interested && !um.on_watchlist);
  });
}
