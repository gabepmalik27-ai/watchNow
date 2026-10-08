"use client";

import { useMemo, useState } from "react";
import { MovieCard } from "@/components/movie/MovieCard";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Panel } from "@/components/ui/Panel";
import { formatAudienceRating, formatMovieMeta } from "@/lib/format";
import { useMovieSearch } from "@/lib/use-movie-search";

/**
 * People search isn't built yet, so this is a small local fixture just for
 * the People result group.
 */
const PEOPLE = [
  { name: "Christopher Nolan", role: "Director" },
  { name: "Greta Gerwig", role: "Director" },
  { name: "Denis Villeneuve", role: "Director" },
  { name: "Yorgos Lanthimos", role: "Director" },
];

type SearchClientProps = {
  /** Every genre in the catalog, alphabetical (from getGenres on the server). */
  genres: string[];
};

export function SearchClient({ genres }: SearchClientProps) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const search = useMovieSearch(query, genre);

  // The query the shown results belong to, so every result group updates together.
  const q = search.query.toLowerCase();
  const matchedMovies = search.results;

  function toggleGenre(next: string) {
    setGenre((current) => (current === next ? null : next));
  }

  const matchedPeople = useMemo(() => {
    if (!q) return [];
    return PEOPLE.filter((p) => p.name.toLowerCase().includes(q));
  }, [q]);

  const matchedGenres = useMemo(() => {
    if (!q) return [];
    return genres.filter((g) => g.toLowerCase().includes(q));
  }, [q, genres]);

  const [topResult, ...restMovies] = matchedMovies;
  const hasQuery = search.status !== "idle";
  const noResults =
    search.status === "done" &&
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
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by genre">
            {genres.map((name) => (
              <FilterChip
                key={name}
                label={name}
                selected={genre === name}
                onClick={() => toggleGenre(name)}
              />
            ))}
          </div>
        </div>

        {!hasQuery ? (
          <p className="text-muted">
            Start typing to search movies, people, and genres, or pick a genre.
          </p>
        ) : search.status === "error" ? (
          <EmptyState
            title="Search is unavailable right now"
            description="We couldn't reach the movie catalog. Try again in a moment."
          />
        ) : search.status === "loading" && matchedMovies.length === 0 ? (
          <p className="text-muted" role="status">
            Searching…
          </p>
        ) : noResults ? (
          <EmptyState
            title={`No results for "${[search.query, search.genre].filter(Boolean).join(" in ")}"`}
            description="Check the spelling, or try browsing by one of these genres instead."
          >
            <div className="flex flex-wrap justify-center gap-2">
              {genres.map((name) => (
                <FilterChip
                  key={name}
                  label={name}
                  onClick={() => {
                    setQuery("");
                    setGenre(name);
                  }}
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
                    <PosterBlock movie={topResult} sizes="(min-width: 768px) 160px, 100vw" />
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
                  {matchedGenres.map((name) => (
                    <FilterChip
                      key={name}
                      label={name}
                      selected={genre === name}
                      onClick={() => toggleGenre(name)}
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
