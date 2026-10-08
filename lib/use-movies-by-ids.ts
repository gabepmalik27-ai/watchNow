"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogMovie } from "@/types/movie";

/** Max ids per /api/movies request (matches the route's limit). */
const CHUNK_SIZE = 100;

/**
 * In-memory, per-tab cache of every movie the client has seen. Lives for the
 * session only (no browser storage), like the rest of user state.
 */
const cache = new Map<number, CatalogMovie>();

/** Adds movies the page already has (server props, search results) to the cache. */
export function rememberMovies(movies: CatalogMovie[]): void {
  for (const movie of movies) cache.set(movie.id, movie);
}

export function getCachedMovie(id: number): CatalogMovie | undefined {
  return cache.get(id);
}

async function fetchMovies(ids: number[]): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const res = await fetch(`/api/movies?ids=${chunk.join(",")}`);
    if (!res.ok) throw new Error(`Movie lookup failed: HTTP ${res.status}`);
    rememberMovies((await res.json()) as CatalogMovie[]);
  }
}

export type MoviesByIdsState = {
  /** Movies for `ids`, in the same order; ids not in the catalog are dropped. */
  movies: CatalogMovie[];
  loading: boolean;
  error: boolean;
};

/**
 * Resolves movie ids (ratings, watchlist) to catalog rows. Uses `known` and
 * the cache first; only ids it has never seen go to /api/movies.
 */
export function useMoviesByIds(ids: number[], known: CatalogMovie[] = []): MoviesByIdsState {
  rememberMovies(known);
  const key = ids.join(",");
  // Ids we already asked the API for, so a movie missing from the catalog
  // doesn't trigger a refetch on every render.
  const [requested] = useState(() => new Set<number>());
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const missing = (key ? key.split(",").map(Number) : []).filter(
      (id) => !cache.has(id) && !requested.has(id),
    );
    if (missing.length === 0) return;
    for (const id of missing) requested.add(id);

    // No cancellation on purpose: whatever arrives lands in the shared cache,
    // and bumping `version` re-renders with it even if `ids` changed meanwhile.
    setPending((p) => p + 1);
    fetchMovies(missing)
      .then(() => setError(false))
      .catch(() => {
        for (const id of missing) requested.delete(id);
        setError(true);
      })
      .finally(() => {
        setPending((p) => p - 1);
        setVersion((v) => v + 1);
      });
  }, [key, requested]);

  const movies = useMemo(
    () =>
      ids
        .map((id) => cache.get(id))
        .filter((movie): movie is CatalogMovie => Boolean(movie)),
    // `version` bumps when the cache fills, so the lookup reruns then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, version, known],
  );

  return { movies, loading: pending > 0, error };
}
