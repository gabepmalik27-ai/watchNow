"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UserMovie } from "@/types/movie";

type UserStateContextValue = {
  userMovies: UserMovie[];
  getUserMovie: (movieId: number) => UserMovie | undefined;
  setRating: (movieId: number, rating: number) => void;
  toggleWatched: (movieId: number) => void;
  setNotInterested: (movieId: number) => void;
  watchedCount: number;
  ratedCount: number;
  averageRating: number;
};

const UserStateContext = createContext<UserStateContextValue | null>(null);

function defaultUserMovie(movieId: number): UserMovie {
  return { movie_id: movieId, watched: false, rating: null, not_interested: false };
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

export function UserStateProvider({ children }: { children: ReactNode }) {
  const [userMovies, setUserMovies] = useState<UserMovie[]>([]);

  const getUserMovie = useCallback(
    (movieId: number) => userMovies.find((m) => m.movie_id === movieId),
    [userMovies],
  );

  const setRating = useCallback((movieId: number, rating: number) => {
    setUserMovies((movies) => upsert(movies, movieId, { rating, watched: true }));
  }, []);

  const toggleWatched = useCallback((movieId: number) => {
    setUserMovies((movies) => {
      const existing = movies.find((m) => m.movie_id === movieId);
      const nextWatched = existing ? !existing.watched : true;
      return upsert(movies, movieId, { watched: nextWatched });
    });
  }, []);

  const setNotInterested = useCallback((movieId: number) => {
    setUserMovies((movies) => upsert(movies, movieId, { not_interested: true }));
  }, []);

  const watchedCount = useMemo(
    () => userMovies.filter((m) => m.watched).length,
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
      toggleWatched,
      setNotInterested,
      watchedCount,
      ratedCount: ratedMovies.length,
      averageRating,
    }),
    [
      userMovies,
      getUserMovie,
      setRating,
      toggleWatched,
      setNotInterested,
      watchedCount,
      ratedMovies.length,
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
