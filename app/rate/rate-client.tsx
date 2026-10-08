"use client";

import { useRef, useState } from "react";
import { MovieDetailDialog } from "@/components/movie/MovieDetailDialog";
import { MovieRow } from "@/components/movie/MovieRow";
import { PosterButton } from "@/components/movie/PosterButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Toast } from "@/components/ui/Toast";
import { getRateCandidates } from "@/lib/rate-candidates";
import { useMovieSearch } from "@/lib/use-movie-search";
import { getCachedMovie, useMoviesByIds } from "@/lib/use-movies-by-ids";
import { useUserState } from "@/lib/user-state";
import type { CatalogMovie } from "@/types/movie";

/** Keeps the "have you seen these?" row to a scrollable length. */
const CANDIDATE_ROW_SIZE = 40;

type RateClientProps = {
  /** Most-voted movies from getCandidatePool on the server. */
  pool: CatalogMovie[];
};

export function RateClient({ pool }: RateClientProps) {
  const { userMovies, getUserMovie, ratedCount, lastRating, undoLastRating } =
    useUserState();
  const [dismissedToken, setDismissedToken] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogMovie | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  function openMovie(movie: CatalogMovie, trigger: HTMLButtonElement) {
    openerRef.current = trigger;
    setSelected(movie);
  }

  function closeMovie() {
    setSelected(null);
    // Native <dialog> restores focus itself; this is a fallback for when the
    // opener was re-mounted (e.g. it moved between rows after being rated).
    const opener = openerRef.current;
    if (opener && !opener.isConnected) return;
    opener?.focus();
  }

  // Rated or watchlisted movies may be outside the pool (e.g. found via
  // search); useMoviesByIds fetches those from /api/movies.
  const { movies: watchlist } = useMoviesByIds(
    userMovies.filter((um) => um.on_watchlist && !um.watched).map((um) => um.movie_id),
    pool,
  );
  const candidates = getRateCandidates(pool, userMovies).slice(0, CANDIDATE_ROW_SIZE);
  // Array order is oldest -> newest touched, so reverse for most recent first.
  const { movies: recentlyRated } = useMoviesByIds(
    userMovies
      .filter((um) => um.rating !== null)
      .map((um) => um.movie_id)
      .reverse(),
    pool,
  );

  const trimmed = query.trim();
  const search = useMovieSearch(query);
  const matches = search.results;
  const searching = search.status === "idle" || search.status === "loading";

  const toastVisible = lastRating !== null && lastRating.token !== dismissedToken;
  const toastMovie = lastRating
    ? selected?.id === lastRating.movieId
      ? selected
      : getCachedMovie(lastRating.movieId)
    : undefined;

  const toast =
    toastVisible && lastRating && toastMovie ? (
      <Toast
        toastKey={lastRating.token}
        message={`Rated ${toastMovie.title} ★${lastRating.rating.toFixed(1)}`}
        actionLabel="Undo"
        onAction={undoLastRating}
        onDismiss={() => setDismissedToken(lastRating.token)}
      />
    ) : null;

  const renderPoster = (movie: CatalogMovie) => (
    <PosterButton movie={movie} userMovie={getUserMovie(movie.id)} onOpen={openMovie} />
  );

  return (
    <main className="pb-16 pt-8">
      <PageContainer className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold text-text">Rate Movies</h1>
            <p className="text-sm text-muted">{ratedCount} rated</p>
          </div>
          <p className="text-muted">
            Every rating improves your recommendations.
          </p>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a movie you watched..."
            aria-label="Search for a movie you watched"
            className="mt-2 h-12 w-full max-w-2xl rounded-full border border-border bg-panel px-5 text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
          />
        </div>

        {trimmed ? (
          search.status === "error" ? (
            <EmptyState
              title="Search is unavailable right now"
              description="We couldn't reach the movie catalog. Try again in a moment."
            />
          ) : searching && matches.length === 0 ? (
            <p className="text-muted" role="status">
              Searching…
            </p>
          ) : matches.length === 0 ? (
            <EmptyState
              title="No movies match your search"
              description="Try a different title, or clear the search to see all popular movies."
            />
          ) : (
            <div className="grid grid-cols-2 gap-6 tablet:grid-cols-4 desktop:grid-cols-6">
              {matches.map((movie) => (
                <div key={movie.id}>{renderPoster(movie)}</div>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-8">
            {watchlist.length > 0 ? (
              <MovieRow
                title="From your watchlist"
                movies={watchlist}
                renderItem={renderPoster}
              />
            ) : null}
            <MovieRow
              title="Recommended — have you seen these?"
              movies={candidates}
              renderItem={renderPoster}
            />
            {recentlyRated.length > 0 ? (
              <MovieRow
                title="Recently rated"
                movies={recentlyRated}
                renderItem={renderPoster}
              />
            ) : null}
          </div>
        )}
      </PageContainer>

      {/* Inside the dialog while it's open: a modal makes outside content inert, so Undo would be unclickable. */}
      <MovieDetailDialog movie={selected} onClose={closeMovie}>
        {selected ? toast : null}
      </MovieDetailDialog>
      {selected ? null : toast}
    </main>
  );
}
