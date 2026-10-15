"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MovieRow } from "@/components/movie/MovieRow";
import { PosterButton } from "@/components/movie/PosterButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { useMovieDetail } from "@/lib/movie-detail";
import { getRateCandidates } from "@/lib/rate-candidates";
import { useMovieSearch } from "@/lib/use-movie-search";
import { useMoviesByIds } from "@/lib/use-movies-by-ids";
import { useUserState } from "@/lib/user-state";
import type { CatalogMovie } from "@/types/movie";

/** Keeps the "have you seen these?" row to a scrollable length. */
const CANDIDATE_ROW_SIZE = 40;

/** A TMDB id as it may appear in ?movie= (same rule as /api/movies). */
const MOVIE_ID_PATTERN = /^[1-9]\d{0,9}$/;

/**
 * /rate?movie=ID: opens the rating dialog for that movie once it's known
 * (from the pool, the client cache, or /api/movies). Closing the dialog
 * drops the param without a reload. Invalid or unknown ids are ignored.
 */
function RateDeepLink({ pool }: { pool: CatalogMovie[] }) {
  const raw = useSearchParams().get("movie");
  const router = useRouter();
  const { openMovie } = useMovieDetail();
  const id = raw && MOVIE_ID_PATTERN.test(raw) ? Number(raw) : null;
  const inPool = id === null ? undefined : pool.find((movie) => movie.id === id);
  const { movies } = useMoviesByIds(id !== null && !inPool ? [id] : []);
  const movie = inPool ?? movies[0];
  // The id already opened, so re-renders don't reopen it after it's closed.
  const openedRef = useRef<number | null>(null);

  useEffect(() => {
    if (id === null) openedRef.current = null;
    if (!movie || openedRef.current === movie.id) return;
    openedRef.current = movie.id;
    openMovie(movie, undefined, {
      mode: "rate",
      onClose: () => router.replace("/rate", { scroll: false }),
    });
  }, [id, movie, openMovie, router]);

  return null;
}

type RateClientProps = {
  /** Most-voted movies from getCandidatePool on the server. */
  pool: CatalogMovie[];
};

export function RateClient({ pool }: RateClientProps) {
  const { userMovies, getUserMovie, ratedCount } = useUserState();
  const { openMovie } = useMovieDetail();
  const [query, setQuery] = useState("");

  function openForRating(movie: CatalogMovie, trigger: HTMLButtonElement) {
    openMovie(movie, trigger, { mode: "rate" });
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

  const renderPoster = (movie: CatalogMovie) => (
    <PosterButton movie={movie} userMovie={getUserMovie(movie.id)} onOpen={openForRating} />
  );

  return (
    <main className="pb-16 pt-8">
      {/* useSearchParams needs a Suspense boundary on a statically rendered page. */}
      <Suspense fallback={null}>
        <RateDeepLink pool={pool} />
      </Suspense>
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
    </main>
  );
}
