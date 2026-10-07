"use client";

import { useEffect, useRef, useState } from "react";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { FilterChip } from "@/components/ui/FilterChip";
import { StarRating } from "@/components/ui/StarRating";
import { useUserState } from "@/lib/user-state";
import type { Movie } from "@/types/movie";

type MovieDetailDialogProps = {
  movie: Movie | null;
  onClose: () => void;
};

export function MovieDetailDialog({ movie, onClose }: MovieDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { getUserMovie, setRating, toggleWatched, toggleWatchlist } = useUserState();

  // Keep rendering the last movie while the closing animation/unmount settles,
  // so content doesn't blank out the moment `movie` becomes null.
  const [shown, setShown] = useState<Movie | null>(movie);
  if (movie && movie !== shown) setShown(movie);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (movie && !dialog.open) dialog.showModal();
    if (!movie && dialog.open) dialog.close();
  }, [movie]);

  // showModal() doesn't stop the page behind from scrolling.
  useEffect(() => {
    if (!movie) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [movie]);

  const current = movie ?? shown;
  const userMovie = current ? getUserMovie(current.id) : undefined;
  const rating = userMovie?.rating ?? null;
  const watched = userMovie?.watched ?? false;
  const onWatchlist = userMovie?.on_watchlist ?? false;

  return (
    <dialog
      ref={dialogRef}
      // Fires for Esc, the X button's close(), and backdrop clicks alike.
      onClose={onClose}
      onClick={(event) => {
        // A click whose target is the <dialog> itself landed on the backdrop.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      aria-labelledby="movie-dialog-title"
      className="movie-dialog m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-border bg-panel p-0 text-text backdrop:bg-midnight/80 tablet:m-auto tablet:max-w-2xl tablet:rounded-2xl"
    >
      {current ? (
        <div className="relative flex flex-col gap-6 p-6 tablet:flex-row tablet:p-8">
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialogRef.current?.close()}
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-xl text-muted transition-colors hover:bg-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
          >
            <span aria-hidden="true">×</span>
          </button>

          <div className="w-32 shrink-0 self-center tablet:w-48 tablet:self-start">
            <PosterBlock movieId={current.id} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-col gap-1 pr-8">
              <h2 id="movie-dialog-title" className="text-2xl font-bold">
                {current.title}
              </h2>
              <p className="text-sm text-muted">
                {current.release_year} · {current.runtime_min} min ·{" "}
                {current.genres.join(", ")}
              </p>
            </div>

            <p className="text-sm text-text">{current.overview}</p>

            <p className="text-sm text-muted">
              Audience{" "}
              <span className="font-semibold text-text">
                <span className="text-rating" aria-hidden="true">
                  ★
                </span>{" "}
                {(current.vote_average / 2).toFixed(1)}
              </span>
            </p>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Your rating</p>
              <StarRating
                value={rating}
                onChange={(value) => setRating(current.id, value)}
                label={`Rate ${current.title}`}
                size="md"
              />
              {rating === null ? (
                <p className="text-xs text-muted">
                  Tap a star — half stars supported
                </p>
              ) : (
                <p className="text-xs text-muted">{rating.toFixed(1)} out of 5</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterChip
                label="Watched"
                selected={watched}
                onClick={() => toggleWatched(current.id)}
              />
              {watched ? null : (
                <FilterChip
                  label="Watchlist"
                  selected={onWatchlist}
                  onClick={() => toggleWatchlist(current.id)}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
