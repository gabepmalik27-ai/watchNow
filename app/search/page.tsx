"use client";

import { useEffect, useMemo, useState } from "react";
import { MovieCard } from "@/components/movie/MovieCard";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Panel } from "@/components/ui/Panel";
import { formatAudienceRating, formatMovieMeta } from "@/lib/format";
import { placeholderMovies } from "@/lib/placeholder-data";

/**
 * The Movie type has no cast/crew fields (see types/movie.ts), so this is a
 * small local fixture just for the People result group — not part of the
 * lib/placeholder-data.ts contract.
 */
const PEOPLE = [
  { name: "Christopher Nolan", role: "Director" },
  { name: "Greta Gerwig", role: "Director" },
  { name: "Denis Villeneuve", role: "Director" },
  { name: "Yorgos Lanthimos", role: "Director" },
];

const ALL_GENRES = Array.from(
  new Set(placeholderMovies.flatMap((m) => m.genres)),
).sort();

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const q = debouncedQuery.toLowerCase();

  const matchedMovies = useMemo(() => {
    if (!q) return [];
    return placeholderMovies.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.genres.some((g) => g.toLowerCase().includes(q)),
    );
  }, [q]);

  const matchedPeople = useMemo(() => {
    if (!q) return [];
    return PEOPLE.filter((p) => p.name.toLowerCase().includes(q));
  }, [q]);

  const matchedGenres = useMemo(() => {
    if (!q) return [];
    return ALL_GENRES.filter((g) => g.toLowerCase().includes(q));
  }, [q]);

  const [topResult, ...restMovies] = matchedMovies;
  const hasQuery = debouncedQuery.length > 0;
  const noResults =
    hasQuery &&
    matchedMovies.length === 0 &&
    matchedPeople.length === 0 &&
    matchedGenres.length === 0;

  return (
    <main className="pb-16 pt-8">
      <PageContainer className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-text">Search WatchNow</h1>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search movies, people, or genres..."
            aria-label="Search WatchNow"
            className="h-12 w-full max-w-2xl rounded-full border border-border bg-panel px-5 text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
          />
        </div>

        {!hasQuery ? (
          <p className="text-muted">
            Start typing to search movies, people, and genres.
          </p>
        ) : noResults ? (
          <EmptyState
            title={`No results for "${debouncedQuery}"`}
            description="Check the spelling, or try browsing by one of these genres instead."
          >
            <div className="flex flex-wrap justify-center gap-2">
              {ALL_GENRES.map((genre) => (
                <FilterChip
                  key={genre}
                  label={genre}
                  onClick={() => setQuery(genre)}
                />
              ))}
            </div>
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-10">
            {topResult ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-bold text-text">Top result</h2>
                <Panel className="flex flex-col gap-4 tablet:flex-row">
                  <div className="w-full tablet:w-40">
                    <PosterBlock movieId={topResult.id} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xl font-bold text-text">
                      {topResult.title}
                    </h3>
                    <p className="text-sm text-muted">
                      {formatMovieMeta(topResult)}
                    </p>
                    <p className="text-sm text-text">{topResult.overview}</p>
                    <p className="text-sm text-rating">
                      ★ {formatAudienceRating(topResult.vote_average)}
                    </p>
                  </div>
                </Panel>
              </section>
            ) : null}

            {matchedPeople.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-bold text-text">People</h2>
                <div className="flex flex-wrap gap-3">
                  {matchedPeople.map((person) => (
                    <Panel key={person.name} className="p-4">
                      <p className="font-semibold text-text">{person.name}</p>
                      <p className="text-sm text-muted">{person.role}</p>
                    </Panel>
                  ))}
                </div>
              </section>
            ) : null}

            {restMovies.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-bold text-text">Movies</h2>
                <div className="grid grid-cols-2 gap-4 tablet:grid-cols-3 desktop:grid-cols-5">
                  {restMovies.map((movie) => (
                    <MovieCard key={movie.id} movie={movie} />
                  ))}
                </div>
              </section>
            ) : null}

            {matchedGenres.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-bold text-text">Genres</h2>
                <div className="flex flex-wrap gap-2">
                  {matchedGenres.map((genre) => (
                    <FilterChip
                      key={genre}
                      label={genre}
                      onClick={() => setQuery(genre)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </PageContainer>
    </main>
  );
}
