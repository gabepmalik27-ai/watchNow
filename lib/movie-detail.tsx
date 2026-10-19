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
import { MovieDetailDialog, type DetailMode } from "@/components/movie/MovieDetailDialog";
import { Toast } from "@/components/ui/Toast";
import { formatUserRating, ratingLabel } from "@/lib/rating-scale";
import { getCachedMovie, rememberMovies } from "@/lib/use-movies-by-ids";
import { useUserState } from "@/lib/user-state";
import type { CatalogMovie } from "@/types/movie";

export type { DetailMode } from "@/components/movie/MovieDetailDialog";

export type OpenMovieOptions = {
  /** "rate" shows the stars (Rate page); "browse" everywhere else. */
  mode?: DetailMode;
  /** Called once after the dialog closes, however it was closed. */
  onClose?: () => void;
};

type MovieDetailContextValue = {
  openMovie: (movie: CatalogMovie, trigger?: HTMLElement, options?: OpenMovieOptions) => void;
  closeMovie: () => void;
};

const MovieDetailContext = createContext<MovieDetailContextValue | null>(null);

type OpenState = { movie: CatalogMovie; mode: DetailMode };

/**
 * The one movie detail dialog for the whole app. Any poster or card calls
 * openMovie; the dialog, its focus handling and the rating Undo toast live
 * here instead of being repeated on every page.
 */
export function MovieDetailProvider({ children }: { children: ReactNode }) {
  const { lastRating, undoLastRating } = useUserState();
  const [open, setOpen] = useState<OpenState | null>(null);
  const [dismissedToken, setDismissedToken] = useState(0);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef<(() => void) | undefined>(undefined);

  const openMovie = useCallback(
    (movie: CatalogMovie, trigger?: HTMLElement, options?: OpenMovieOptions) => {
      // The Undo toast looks titles up in this cache.
      rememberMovies([movie]);
      triggerRef.current = trigger ?? null;
      onCloseRef.current = options?.onClose;
      setOpen({ movie, mode: options?.mode ?? "browse" });
    },
    [],
  );

  // Setting null makes the dialog call close(), whose close event runs handleClose.
  const closeMovie = useCallback(() => setOpen(null), []);

  /** Runs for every close: Esc, backdrop, the X button and closeMovie(). */
  const handleClose = useCallback(() => {
    setOpen(null);
    const onClose = onCloseRef.current;
    onCloseRef.current = undefined;
    onClose?.();
    // Native <dialog> restores focus itself; this is a fallback for when the
    // opener was re-mounted (e.g. it moved between rows after being rated).
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger?.isConnected) trigger.focus();
  }, []);

  const toastVisible = lastRating !== null && lastRating.token !== dismissedToken;
  const toastMovie = lastRating
    ? open?.movie.id === lastRating.movieId
      ? open.movie
      : getCachedMovie(lastRating.movieId)
    : undefined;
  const toast =
    toastVisible && lastRating ? (
      <Toast
        toastKey={lastRating.token}
        message={
          lastRating.kind === "removed"
            ? "Rating removed"
            : toastMovie
              ? `Rated ${toastMovie.title} ${formatUserRating(lastRating.rating)} · ${ratingLabel(lastRating.rating)}`
              : `Rated ${formatUserRating(lastRating.rating)} · ${ratingLabel(lastRating.rating)}`
        }
        actionLabel="Undo"
        onAction={undoLastRating}
        onDismiss={() => setDismissedToken(lastRating.token)}
      />
    ) : null;

  const value = useMemo(() => ({ openMovie, closeMovie }), [openMovie, closeMovie]);

  return (
    <MovieDetailContext.Provider value={value}>
      {children}
      {/* Inside the dialog while it's open: a modal makes outside content inert, so Undo would be unclickable. */}
      <MovieDetailDialog movie={open?.movie ?? null} mode={open?.mode ?? "browse"} onClose={handleClose}>
        {open ? toast : null}
      </MovieDetailDialog>
      {open ? null : toast}
    </MovieDetailContext.Provider>
  );
}

export function useMovieDetail(): MovieDetailContextValue {
  const context = useContext(MovieDetailContext);
  if (!context) {
    throw new Error("useMovieDetail must be used within a MovieDetailProvider");
  }
  return context;
}
