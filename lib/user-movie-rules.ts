import type { UserMovie } from "@/types/movie";

/**
 * The rules for how one movie's user state changes. Pure, so they can be
 * unit-tested; lib/user-state.tsx applies them and persists the result.
 * The database enforces the same invariants with CHECK constraints
 * (supabase/migrations/0003_watchlist_invariant.sql):
 * - a watched movie is never on the watchlist.
 *
 * Each function takes the movie's current row (undefined = no row yet) and
 * returns the next row, or null when the action is not allowed / changes nothing.
 */

export function emptyUserMovie(movieId: number): UserMovie {
  return {
    movie_id: movieId,
    watched: false,
    rating: null,
    not_interested: false,
    on_watchlist: false,
  };
}

/** Rating a movie marks it watched and takes it off the watchlist. */
export function applyRating(row: UserMovie | undefined, movieId: number, rating: number): UserMovie {
  return { ...(row ?? emptyUserMovie(movieId)), rating, watched: true, on_watchlist: false };
}

/** Marking watched takes the movie off the watchlist; un-marking leaves the rest as is. */
export function applyToggleWatched(row: UserMovie | undefined, movieId: number): UserMovie {
  const base = row ?? emptyUserMovie(movieId);
  return base.watched
    ? { ...base, watched: false }
    : { ...base, watched: true, on_watchlist: false };
}

/** A watched movie can't go on the watchlist (null); otherwise flips on_watchlist. */
export function applyToggleWatchlist(row: UserMovie | undefined, movieId: number): UserMovie | null {
  const base = row ?? emptyUserMovie(movieId);
  if (base.watched) return null;
  return { ...base, on_watchlist: !base.on_watchlist };
}
