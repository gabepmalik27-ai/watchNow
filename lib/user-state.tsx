"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Toast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
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
  /** False until the signed-in user's saved rows have loaded. */
  loaded: boolean;
};

type UndoSnapshot = {
  movieId: number;
  previous: UserMovie | undefined;
  index: number;
};

type SaveError = { message: string; token: number };

const USER_MOVIE_COLUMNS = "movie_id, watched, rating, on_watchlist, not_interested";
const SAVE_ERROR = "Couldn't save your change. Please try again.";
const LOAD_ERROR = "Couldn't load your saved movies. Reload the page to try again.";

const UserStateContext = createContext<UserStateContextValue | null>(null);

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
 * Moves the touched movie to the end of the array. Array order
 * (most-recently-touched last) is what For You and Rate sort by; on load it
 * is rebuilt from updated_at.
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

/** Replaces (or removes, when `row` is undefined) one movie, keeping its position. */
function replaceInPlace(
  movies: UserMovie[],
  movieId: number,
  row: UserMovie | undefined,
): UserMovie[] {
  if (!row) return movies.filter((m) => m.movie_id !== movieId);
  const index = movies.findIndex((m) => m.movie_id === movieId);
  if (index === -1) return [...movies, row];
  return movies.map((m) => (m.movie_id === movieId ? row : m));
}

/**
 * Per-user rating / watched / watchlist state, persisted to public.user_movies.
 *
 * Every change is applied to local state immediately (optimistic), then
 * written to Supabase. Writes for the same movie are queued so they land in
 * order. If a write fails, that movie snaps back to its last saved row, any
 * writes still queued behind it are dropped, and an error toast is shown.
 * RLS limits every query to the signed-in user's own rows.
 */
export function UserStateProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const userId = user?.id ?? null;
  const authLoading = status === "loading";

  const [userMovies, setUserMovies] = useState<UserMovie[]>([]);
  const [lastRating, setLastRating] = useState<LastRating | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);

  // Mirrors state so event handlers can read the latest value synchronously
  // (needed to snapshot "before" state for undo without side effects inside
  // a state updater).
  const userMoviesRef = useRef(userMovies);
  const undoRef = useRef<UndoSnapshot | null>(null);
  const tokenRef = useRef(0);

  // Persistence bookkeeping. Reset whenever the signed-in user changes.
  const userIdRef = useRef<string | null>(null);
  /** Bumped on user change so late responses for a previous user are ignored. */
  const generationRef = useRef(0);
  /** Last row the database is known to hold, per movie (undefined = no row). */
  const confirmedRef = useRef(new Map<number, UserMovie | undefined>());
  /** Tail of each movie's write queue. */
  const queueRef = useRef(new Map<number, Promise<void>>());
  /** Bumped per movie when a write fails, cancelling writes queued behind it. */
  const epochRef = useRef(new Map<number, number>());
  /** Movies changed locally before the initial load finished; local wins. */
  const touchedRef = useRef(new Set<number>());

  const commit = useCallback((next: UserMovie[]) => {
    userMoviesRef.current = next;
    setUserMovies(next);
  }, []);

  const showError = useCallback((message: string) => {
    tokenRef.current += 1;
    setSaveError({ message, token: tokenRef.current });
  }, []);

  // Load the signed-in user's rows; clear everything on sign-out or user switch.
  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    userIdRef.current = userId;
    confirmedRef.current = new Map();
    queueRef.current = new Map();
    epochRef.current = new Map();
    touchedRef.current = new Set();
    undoRef.current = null;
    commit([]);
    setLastRating(null);
    setSaveError(null);

    if (authLoading) {
      setLoaded(false);
      return;
    }
    if (!userId) {
      setLoaded(true);
      return;
    }

    setLoaded(false);
    getSupabaseBrowser()
      .from("user_movies")
      .select(USER_MOVIE_COLUMNS)
      .order("updated_at", { ascending: true })
      .then(({ data, error }) => {
        if (generation !== generationRef.current) return;
        if (error) {
          showError(LOAD_ERROR);
          setLoaded(true);
          return;
        }
        const rows: UserMovie[] = data.map((row) => ({
          ...row,
          // numeric columns can arrive as strings depending on the driver.
          rating: row.rating === null ? null : Number(row.rating),
        }));
        const touched = touchedRef.current;
        for (const row of rows) {
          if (!touched.has(row.movie_id)) confirmedRef.current.set(row.movie_id, row);
        }
        const local = userMoviesRef.current.filter((m) => touched.has(m.movie_id));
        commit([...rows.filter((row) => !touched.has(row.movie_id)), ...local]);
        setLoaded(true);
      });
  }, [userId, authLoading, commit, showError]);

  /** Snaps one movie back to its last saved row after a failed write. */
  const rollback = useCallback(
    (movieId: number) => {
      epochRef.current.set(movieId, (epochRef.current.get(movieId) ?? 0) + 1);
      commit(replaceInPlace(userMoviesRef.current, movieId, confirmedRef.current.get(movieId)));
      if (undoRef.current?.movieId === movieId) {
        undoRef.current = null;
        setLastRating(null);
      }
      showError(SAVE_ERROR);
    },
    [commit, showError],
  );

  /** Queues a write of `row` (or a delete, when undefined) for one movie. */
  const persist = useCallback(
    (movieId: number, row: UserMovie | undefined) => {
      const ownerId = userIdRef.current;
      if (!ownerId) return;
      const generation = generationRef.current;
      const epoch = epochRef.current.get(movieId) ?? 0;
      const stale = () =>
        generation !== generationRef.current || epoch !== (epochRef.current.get(movieId) ?? 0);

      const previous = queueRef.current.get(movieId) ?? Promise.resolve();
      const next = previous.then(async () => {
        if (stale()) return;
        const table = getSupabaseBrowser().from("user_movies");
        let failed: boolean;
        try {
          const { error } = row
            ? await table.upsert(
                { ...row, user_id: ownerId, updated_at: new Date().toISOString() },
                { onConflict: "user_id,movie_id" },
              )
            : await table.delete().eq("user_id", ownerId).eq("movie_id", movieId);
          failed = error !== null;
        } catch {
          failed = true;
        }
        if (stale()) return;
        if (failed) rollback(movieId);
        else confirmedRef.current.set(movieId, row);
      });
      queueRef.current.set(movieId, next);
    },
    [rollback],
  );

  /** Optimistically applies `next`, then persists the touched movie's row. */
  const apply = useCallback(
    (movieId: number, next: UserMovie[]) => {
      touchedRef.current.add(movieId);
      commit(next);
      persist(movieId, next.find((m) => m.movie_id === movieId));
    },
    [commit, persist],
  );

  const getUserMovie = useCallback(
    (movieId: number) => userMovies.find((m) => m.movie_id === movieId),
    [userMovies],
  );

  const setRating = useCallback(
    (movieId: number, rating: number) => {
      if (!userIdRef.current) return;
      const current = userMoviesRef.current;
      const index = current.findIndex((m) => m.movie_id === movieId);
      undoRef.current = {
        movieId,
        previous: index === -1 ? undefined : current[index],
        index,
      };
      tokenRef.current += 1;
      setLastRating({ movieId, rating, token: tokenRef.current });
      apply(movieId, upsert(current, movieId, { rating, watched: true, on_watchlist: false }));
    },
    [apply],
  );

  const undoLastRating = useCallback(() => {
    const snapshot = undoRef.current;
    if (!snapshot || !userIdRef.current) return;
    const without = userMoviesRef.current.filter((m) => m.movie_id !== snapshot.movieId);
    if (snapshot.previous) {
      const at = Math.min(snapshot.index, without.length);
      commit([...without.slice(0, at), snapshot.previous, ...without.slice(at)]);
    } else {
      commit(without);
    }
    touchedRef.current.add(snapshot.movieId);
    // Writes the restored row back (or deletes it if the movie had no row).
    persist(snapshot.movieId, snapshot.previous);
    undoRef.current = null;
    setLastRating(null);
  }, [commit, persist]);

  const toggleWatched = useCallback(
    (movieId: number) => {
      if (!userIdRef.current) return;
      const current = userMoviesRef.current;
      const existing = current.find((m) => m.movie_id === movieId);
      const nextWatched = existing ? !existing.watched : true;
      apply(
        movieId,
        upsert(
          current,
          movieId,
          nextWatched ? { watched: true, on_watchlist: false } : { watched: false },
        ),
      );
    },
    [apply],
  );

  const toggleWatchlist = useCallback(
    (movieId: number) => {
      if (!userIdRef.current) return;
      const current = userMoviesRef.current;
      const existing = current.find((m) => m.movie_id === movieId);
      apply(movieId, upsert(current, movieId, { on_watchlist: !existing?.on_watchlist }));
    },
    [apply],
  );

  const setNotInterested = useCallback(
    (movieId: number) => {
      if (!userIdRef.current) return;
      apply(movieId, upsert(userMoviesRef.current, movieId, { not_interested: true }));
    },
    [apply],
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
      loaded,
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
      loaded,
    ],
  );

  return (
    <UserStateContext.Provider value={value}>
      {children}
      {saveError ? (
        <Toast
          toastKey={saveError.token}
          message={saveError.message}
          tone="error"
          onDismiss={() => setSaveError(null)}
        />
      ) : null}
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
