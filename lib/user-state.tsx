"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UserMovie } from "@/types/movie";

export type LastRating = {
  movieId: number;
  rating: number;
  /** Increments on every rating so repeat ratings of the same value still re-trigger the toast. */
  token: number;
};

type UserStateContextValue = {
  userMovies: UserMovie[];
  getUserMovie: (movieId: number) => UserMovie | undefined;
  setRating: (movieId: number, rating: number) => void;
  undoLastRating: () => void;
  lastRating: LastRating | null;
  toggleWatched: (movieId: number) => void;
  toggleWatchlist: (movieId: number) => void;
  setNotInterested: (movieId: number) => void;
  watchedCount: number;
  ratedCount: number;
  watchlistCount: number;
  averageRating: number;
};

type UndoSnapshot = {
  movieId: number;
  previous: UserMovie | undefined;
  index: number;
};

const UserStateContext = createContext<UserStateContextValue | null>(null);

/**
 * TMDB ids of the six movies the in-session watchlist starts with: Dune,
 * Poor Things, The Holdovers, Oppenheimer, Past Lives, Barbie. Ids only;
 * pages resolve them to catalog rows with useMoviesByIds.
 */
const DEFAULT_WATCHLIST_IDS = [438631, 792307, 840430, 872585, 666277, 346698];

function defaultUserMovie(movieId: number): UserMovie {
  return {
    movie_id: movieId,
    watched: false,
    rating: null,
    not_interested: false,
    on_watchlist: false,
  };
}

/**
 * Moves the touched movie to the end of the array. There's no timestamp
 * field on UserMovie, so array order (most-recently-touched last) is the
 * only signal available for "most recent" sorting in For You.
 */
function upsert(
  movies: UserMovie[],
  movieId: number,
  patch: Partial<Omit<UserMovie, "movie_id">>,
): UserMovie[] {
  const existing = movies.find((m) => m.movie_id === movieId);
  const rest = movies.filter((m) => m.movie_id !== movieId);
  const updated = existing
    ? { ...existing, ...patch }
    : { ...defaultUserMovie(movieId), ...patch };
  return [...rest, updated];
}

export function UserStateProvider({
  children,
  initialWatchlistIds = DEFAULT_WATCHLIST_IDS,
}: {
  children: ReactNode;
  initialWatchlistIds?: number[];
}) {
  const [userMovies, setUserMovies] = useState<UserMovie[]>(() =>
    initialWatchlistIds.map((id) => ({ ...defaultUserMovie(id), on_watchlist: true })),
  );
  const [lastRating, setLastRating] = useState<LastRating | null>(null);

  // Mirrors state so event handlers can read the latest value synchronously
  // (needed to snapshot "before" state for undo without side effects inside
  // a state updater).
  const userMoviesRef = useRef(userMovies);
  const undoRef = useRef<UndoSnapshot | null>(null);
  const tokenRef = useRef(0);

  const commit = useCallback((next: UserMovie[]) => {
    userMoviesRef.current = next;
    setUserMovies(next);
  }, []);

  const getUserMovie = useCallback(
    (movieId: number) => userMovies.find((m) => m.movie_id === movieId),
    [userMovies],
  );

  const setRating = useCallback(
    (movieId: number, rating: number) => {
      const current = userMoviesRef.current;
      const index = current.findIndex((m) => m.movie_id === movieId);
      undoRef.current = {
        movieId,
        previous: index === -1 ? undefined : current[index],
        index,
      };
      tokenRef.current += 1;
      setLastRating({ movieId, rating, token: tokenRef.current });
      commit(upsert(current, movieId, { rating, watched: true, on_watchlist: false }));
    },
    [commit],
  );

  const undoLastRating = useCallback(() => {
    const snapshot = undoRef.current;
    if (!snapshot) return;
    const without = userMoviesRef.current.filter((m) => m.movie_id !== snapshot.movieId);
    if (snapshot.previous) {
      const at = Math.min(snapshot.index, without.length);
      commit([...without.slice(0, at), snapshot.previous, ...without.slice(at)]);
    } else {
      commit(without);
    }
    undoRef.current = null;
    setLastRating(null);
  }, [commit]);

  const toggleWatched = useCallback(
    (movieId: number) => {
      const current = userMoviesRef.current;
      const existing = current.find((m) => m.movie_id === movieId);
      const nextWatched = existing ? !existing.watched : true;
      commit(
        upsert(
          current,
          movieId,
          nextWatched ? { watched: true, on_watchlist: false } : { watched: false },
        ),
      );
    },
    [commit],
  );

  const toggleWatchlist = useCallback(
    (movieId: number) => {
      const current = userMoviesRef.current;
      const existing = current.find((m) => m.movie_id === movieId);
      commit(upsert(current, movieId, { on_watchlist: !existing?.on_watchlist }));
    },
    [commit],
  );

  const setNotInterested = useCallback(
    (movieId: number) => {
      commit(upsert(userMoviesRef.current, movieId, { not_interested: true }));
    },
    [commit],
  );

  const watchedCount = useMemo(
    () => userMovies.filter((m) => m.watched).length,
    [userMovies],
  );

  const watchlistCount = useMemo(
    () => userMovies.filter((m) => m.on_watchlist && !m.watched).length,
    [userMovies],
  );

  const ratedMovies = useMemo(
    () => userMovies.filter((m) => m.rating !== null),
    [userMovies],
  );

  const averageRating = useMemo(() => {
    if (ratedMovies.length === 0) return 0;
    const sum = ratedMovies.reduce((total, m) => total + (m.rating ?? 0), 0);
    return sum / ratedMovies.length;
  }, [ratedMovies]);

  const value = useMemo<UserStateContextValue>(
    () => ({
      userMovies,
      getUserMovie,
      setRating,
      undoLastRating,
      lastRating,
      toggleWatched,
      toggleWatchlist,
      setNotInterested,
      watchedCount,
      ratedCount: ratedMovies.length,
      watchlistCount,
      averageRating,
    }),
    [
      userMovies,
      getUserMovie,
      setRating,
      undoLastRating,
      lastRating,
      toggleWatched,
      toggleWatchlist,
      setNotInterested,
      watchedCount,
      ratedMovies.length,
      watchlistCount,
      averageRating,
    ],
  );

  return (
    <UserStateContext.Provider value={value}>
      {children}
    </UserStateContext.Provider>
  );
}

export function useUserState(): UserStateContextValue {
  const context = useContext(UserStateContext);
  if (!context) {
    throw new Error("useUserState must be used within a UserStateProvider");
  }
  return context;
}
