"use client";

import { useRef, useState } from "react";
import { MovieDetailDialog } from "@/components/movie/MovieDetailDialog";
import { MovieRow } from "@/components/movie/MovieRow";
import { PosterButton } from "@/components/movie/PosterButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { getRateCandidates } from "@/lib/rate-candidates";
import { placeholderMovies } from "@/lib/placeholder-data";
import { useUserState } from "@/lib/user-state";
import type { Movie } from "@/types/movie";

export default function RatePage() {
  const { userMovies, getUserMovie, ratedCount } = useUserState();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Movie | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  function openMovie(movie: Movie, trigger: HTMLButtonElement) {
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

  const byId = new Map(placeholderMovies.map((m) => [m.id, m]));
  const toMovies = (ids: number[]) =>
    ids.map((id) => byId.get(id)).filter((m): m is Movie => Boolean(m));

  const watchlist = toMovies(
    userMovies.filter((um) => um.on_watchlist && !um.watched).map((um) => um.movie_id),
  );
  const candidates = getRateCandidates(placeholderMovies, userMovies);
  // Array order is oldest -> newest touched, so reverse for most recent first.
  const recentlyRated = toMovies(
    userMovies
      .filter((um) => um.rating !== null)
      .map((um) => um.movie_id)
      .reverse(),
  );

  const trimmed = query.trim().toLowerCase();
  const matches = trimmed
    ? placeholderMovies.filter((m) => m.title.toLowerCase().includes(trimmed))
    : [];

  const renderPoster = (movie: Movie) => (
    <PosterButton movie={movie} userMovie={getUserMovie(movie.id)} onOpen={openMovie} />
  );

  return (
    <main className="pb-24 pt-8">
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
          matches.length === 0 ? (
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

      <MovieDetailDialog movie={selected} onClose={closeMovie} />
    </main>
  );
}
