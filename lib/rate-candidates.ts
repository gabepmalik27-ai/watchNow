import type { UserMovie } from "@/types/movie";

/**
 * Movies worth asking "have you seen this?" about: not watched, not dismissed,
 * not already on the watchlist.
 *
 * Stand-in until the recommender (roadmap step 6) replaces this.
 *
 * The candidate pool is passed in (fetched on the server by
 * getCandidatePool) so this stays a pure filter usable from client code.
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
