"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { FilterChip } from "@/components/ui/FilterChip";
import { StarRating } from "@/components/ui/StarRating";
import { useAuth } from "@/lib/auth";
import { formatMovieMeta } from "@/lib/format";
import { formatAudienceRating } from "@/lib/rating-scale";
import { tmdbImageLoader } from "@/lib/tmdb-image";
import { useUserState } from "@/lib/user-state";
import type { CatalogMovie } from "@/types/movie";

/** "rate": stars and Watched/Watchlist chips (Rate page). "browse": everywhere else. */
export type DetailMode = "browse" | "rate";

/** How many cast names the dialog lists. */
const CAST_SHOWN = 5;

const PRIMARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-electric px-6 text-sm font-semibold text-text transition-colors hover:bg-soft-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-panel";
const TEXT_BUTTON =
  "min-h-11 w-fit rounded px-1 text-sm font-medium text-soft-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric";
const SECONDARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-6 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-panel";

type MovieDetailDialogProps = {
  movie: CatalogMovie | null;
  mode: DetailMode;
  onClose: () => void;
  /**
   * Rendered inside the <dialog>. A modal dialog makes everything outside it
   * inert, so a toast that must stay clickable (Undo) has to live in here.
   */
  children?: ReactNode;
};

export function MovieDetailDialog({ movie, mode, onClose, children }: MovieDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const { status } = useAuth();
  const { getUserMovie, setRating, removeRating, toggleWatched, toggleWatchlist } = useUserState();

  // Keep rendering the last movie while the closing animation/unmount settles,
  // so content doesn't blank out the moment `movie` becomes null.
  const [shown, setShown] = useState<CatalogMovie | null>(movie);
  if (movie && movie !== shown) setShown(movie);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (movie && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the close button; in rate mode the stars come first.
      if (mode === "rate") dialog.querySelector<HTMLElement>('[role="slider"]')?.focus();
    }
    if (!movie && dialog.open) dialog.close();
  }, [movie, mode]);

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
  const signedIn = status === "signed-in";

  /** Closes the dialog (focus returns to the opener), then navigates. */
  function closeAndGo(href: string) {
    dialogRef.current?.close();
    router.push(href);
  }

  /** Sends a signed-out visitor to sign in, then back to this page. */
  function goToLogin() {
    const here = window.location.pathname + window.location.search;
    closeAndGo(`/login?next=${encodeURIComponent(here)}`);
  }

  const cast = current ? current.top_cast.slice(0, CAST_SHOWN) : [];
  const voteCount = current?.vote_count ?? 0;

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
      className="movie-dialog m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto overflow-x-hidden rounded-t-2xl border border-border bg-panel p-0 text-text backdrop:bg-midnight/80 tablet:m-auto tablet:max-w-3xl tablet:rounded-2xl"
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
                sizes="(min-width: 768px) 768px, 100vw"
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

          <div className="flex flex-col gap-6 p-4 tablet:flex-row tablet:gap-8 tablet:p-8">
            <div className="w-40 shrink-0 self-center tablet:w-60 tablet:self-start">
              <PosterBlock movie={current} sizes="(min-width: 768px) 240px, 160px" />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-col gap-1 pr-8">
                <h2 id="movie-dialog-title" className="break-words text-2xl font-bold">
                  {current.title}
                </h2>
                {formatMovieMeta(current) ? (
                  <p className="text-sm text-muted">{formatMovieMeta(current)}</p>
                ) : null}
              </div>

              {current.vote_average !== null || (mode === "browse" && rating !== null) ? (
                <div className="flex flex-col gap-1 text-sm">
                  {current.vote_average !== null ? (
                    <p className="text-muted">
                      Audience{" "}
                      <span className="font-semibold text-text">
                        <span className="text-rating">{formatAudienceRating(current.vote_average)}</span>
                      </span>
                      {voteCount > 0 ? ` · from ${voteCount.toLocaleString("en-US")} ratings` : null}
                    </p>
                  ) : null}
                  {mode === "browse" && rating !== null ? (
                    <p className="text-muted">
                      Your rating{" "}
                      <span className="font-semibold text-text">
                        <span className="text-rating" aria-hidden="true">
                          ★
                        </span>
                        {rating.toFixed(1)}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {current.overview ? (
                <p className="text-sm text-text">{current.overview}</p>
              ) : null}

              {current.director || cast.length > 0 ? (
                <dl className="flex flex-col gap-1 text-sm">
                  {current.director ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted">Director</dt>
                      <dd className="min-w-0 break-words text-text">{current.director}</dd>
                    </div>
                  ) : null}
                  {cast.length > 0 ? (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-muted">Cast</dt>
                      <dd className="min-w-0 break-words text-text">{cast.join(", ")}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              {mode === "rate" ? (
                <>
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
                      <>
                        <p className="text-xs text-muted">{rating.toFixed(1)} out of 5</p>
                        <button
                          type="button"
                          onClick={() => removeRating(current.id)}
                          className={TEXT_BUTTON}
                        >
                          Remove rating
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <FilterChip
                      label="Watched"
                      selected={watched}
                      locked={rating !== null}
                      describedBy={rating !== null ? "watched-locked-hint" : undefined}
                      onClick={() => toggleWatched(current.id)}
                    />
                    {rating !== null ? (
                      <p id="watched-locked-hint" className="text-xs text-muted">
                        Remove your rating first
                      </p>
                    ) : null}
                    {watched ? null : (
                      <FilterChip
                        label="Watchlist"
                        selected={onWatchlist}
                        onClick={() => toggleWatchlist(current.id)}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        signedIn ? closeAndGo(`/rate?movie=${current.id}`) : goToLogin()
                      }
                      className={PRIMARY_BUTTON}
                    >
                      {rating === null ? "Rate this movie" : "Update your rating"}
                    </button>
                    {watched ? (
                      <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-muted">
                        <span aria-hidden="true">✓</span> Watched
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-pressed={signedIn ? onWatchlist : undefined}
                        onClick={() => (signedIn ? toggleWatchlist(current.id) : goToLogin())}
                        className={`${SECONDARY_BUTTON} ${
                          onWatchlist
                            ? "border-electric bg-raised text-text"
                            : "border-border bg-panel text-text hover:bg-raised"
                        }`}
                      >
                        {onWatchlist ? (
                          <>
                            <span aria-hidden="true">✓</span> On watchlist
                          </>
                        ) : (
                          "Add to watchlist"
                        )}
                      </button>
                    )}
                  </div>
                  {signedIn && rating !== null ? (
                    <button
                      type="button"
                      onClick={() => removeRating(current.id)}
                      className={TEXT_BUTTON}
                    >
                      Remove rating
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {children}
    </dialog>
  );
}
