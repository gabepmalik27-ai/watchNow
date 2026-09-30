"use client";

import { useState } from "react";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { StarRating } from "@/components/ui/StarRating";
import { placeholderMovies } from "@/lib/placeholder-data";
import { useUserState } from "@/lib/user-state";

export default function RatePage() {
  const { getUserMovie, setRating, toggleWatched, ratedCount } = useUserState();
  const [query, setQuery] = useState("");
  const [showSaved, setShowSaved] = useState(false);

  const filtered = query
    ? placeholderMovies.filter((m) =>
        m.title.toLowerCase().includes(query.toLowerCase()),
      )
    : placeholderMovies;

  function handleSave() {
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  }

  return (
    <main className="pb-24 pt-8">
      <PageContainer className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-text">Rate Movies</h1>
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

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text">
            Popular movies you may have seen
          </h2>
          <p className="text-sm text-muted">
            {ratedCount} rated this session
          </p>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No movies match your search"
            description="Try a different title, or clear the search to see all popular movies."
          />
        ) : (
          <div className="grid grid-cols-2 gap-6 tablet:grid-cols-3 desktop:grid-cols-5">
            {filtered.map((movie) => {
              const userMovie = getUserMovie(movie.id);
              return (
                <div key={movie.id} className="flex flex-col gap-2">
                  <PosterBlock movieId={movie.id} />
                  <p className="truncate text-sm font-medium text-text">
                    {movie.title}
                  </p>
                  <p className="text-xs text-muted">
                    {movie.release_year} ·{" "}
                    <span className="text-rating">★</span>{" "}
                    {(movie.vote_average / 2).toFixed(1)}
                  </p>
                  <StarRating
                    value={userMovie?.rating ?? null}
                    onChange={(value) => setRating(movie.id, value)}
                    label={`Rate ${movie.title}`}
                    size="sm"
                  />
                  <FilterChip
                    label={userMovie?.watched ? "Watched" : "Mark watched"}
                    selected={userMovie?.watched ?? false}
                    onClick={() => toggleWatched(movie.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </PageContainer>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-navigation px-4 py-4 tablet:bottom-0">
        <PageContainer className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="min-h-11 w-full max-w-2xl rounded-full bg-electric text-sm font-semibold text-text transition-colors hover:bg-soft-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-navigation"
          >
            Save Ratings and Continue
          </button>
          {showSaved ? (
            <p role="status" className="text-sm text-soft-blue">
              ✓ Ratings saved
            </p>
          ) : null}
        </PageContainer>
      </div>
    </main>
  );
}
