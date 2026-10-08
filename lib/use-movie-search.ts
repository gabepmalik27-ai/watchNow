"use client";

import { useEffect, useState } from "react";
import { rememberMovies } from "@/lib/use-movies-by-ids";
import type { CatalogMovie } from "@/types/movie";

export type MovieSearchState = {
  status: "idle" | "loading" | "done" | "error";
  results: CatalogMovie[];
  /** The trimmed query the current results belong to. */
  query: string;
  genre: string | null;
};

const IDLE: MovieSearchState = { status: "idle", results: [], query: "", genre: null };

/**
 * Debounced title search against /api/search. Superseded requests are
 * aborted, so a slow older response can never overwrite a newer one.
 */
export function useMovieSearch(
  query: string,
  genre: string | null = null,
  delayMs = 300,
): MovieSearchState {
  const [state, setState] = useState<MovieSearchState>(IDLE);

  useEffect(() => {
    const q = query.trim();
    if (!q && !genre) {
      setState(IDLE);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((previous) => ({ ...previous, status: "loading" }));
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (genre) params.set("genre", genre);
      try {
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
        const results = (await res.json()) as CatalogMovie[];
        rememberMovies(results);
        setState({ status: "done", results, query: q, genre });
      } catch {
        if (controller.signal.aborted) return;
        setState({ status: "error", results: [], query: q, genre });
      }
    }, delayMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, genre, delayMs]);

  return state;
}
