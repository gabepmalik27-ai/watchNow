"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { FilterChip } from "@/components/ui/FilterChip";
import { StarRating } from "@/components/ui/StarRating";
import { formatAudienceRating, formatMovieMeta } from "@/lib/format";
import { tmdbImageLoader } from "@/lib/tmdb-image";
import { useUserState } from "@/lib/user-state";
import type { CatalogMovie } from "@/types/movie";

type MovieDetailDialogProps = {
  movie: CatalogMovie | null;
  onClose: () => void;
  /**
   * Rendered inside the <dialog>. A modal dialog makes everything outside it
   * inert, so a toast that must stay clickable (Undo) has to live in here.
   */
  children?: ReactNode;
};

export function MovieDetailDialog({ movie, onClose, children }: MovieDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { getUserMovie, setRating, toggleWatched, toggleWatchlist } = useUserState();

  // Keep rendering the last movie while the closing animation/unmount settles,
  // so content doesn't blank out the moment `movie` becomes null.
  const [shown, setShown] = useState<CatalogMovie | null>(movie);
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
        <div className="relative">
          {current.backdrop_path ? (
            // Decorative: the poster below carries the movie's image alt text.
            <div className="relative h-40 w-full tablet:h-56">
              <Image
                loader={tmdbImageLoader}
                src={current.backdrop_path}
                alt=""
                fill
                sizes="(min-width: 768px) 672px, 100vw"
                className="object-cover opacity-50"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/40 to-transparent" />
            </div>
          ) : null}

          <button
            type="button"
            aria-label="Close"
            onClick={() => dialogRef.current?.close()}
            className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-midnight/60 text-xl text-muted transition-colors hover:bg-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
          >
            <span aria-hidden="true">×</span>
          </button>

          <div className="flex flex-col gap-6 p-6 tablet:flex-row tablet:p-8">
            <div className="w-32 shrink-0 self-center tablet:w-48 tablet:self-start">
              <PosterBlock movie={current} sizes="(min-width: 768px) 192px, 128px" />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-col gap-1 pr-8">
                <h2 id="movie-dialog-title" className="text-2xl font-bold">
                  {current.title}
                </h2>
                <p className="text-sm text-muted">
                  {formatMovieMeta(current)}
                </p>
              </div>

              {current.overview ? (
                <p className="text-sm text-text">{current.overview}</p>
              ) : null}

              {current.director || current.top_cast.length > 0 ? (
                <dl className="flex flex-col gap-1 text-sm">
                  {current.director ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted">Director</dt>
                      <dd className="text-text">{current.director}</dd>
                    </div>
                  ) : null}
                  {current.top_cast.length > 0 ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted">Starring</dt>
                      <dd className="text-text">{current.top_cast.join(", ")}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              <p className="text-sm text-muted">
                Audience{" "}
                <span className="font-semibold text-text">
                  <span className="text-rating" aria-hidden="true">
                    ★
                  </span>{" "}
                  {formatAudienceRating(current.vote_average)}
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
        </div>
      ) : null}
      {children}
    </dialog>
  );
}
