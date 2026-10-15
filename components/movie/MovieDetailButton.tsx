"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { useMovieDetail } from "@/lib/movie-detail";
import type { CatalogMovie } from "@/types/movie";

type MovieDetailButtonProps = {
  movie: CatalogMovie;
  children: ReactNode;
  className?: string;
  /**
   * For a poster that duplicates a nearby keyboard-reachable button (e.g. the
   * Search top result's title): clickable, but skipped by Tab and screen readers.
   */
  pointerOnly?: boolean;
};

/** Wraps a poster/title so clicking it opens the shared movie detail dialog. */
export function MovieDetailButton({ movie, children, className, pointerOnly = false }: MovieDetailButtonProps) {
  const { openMovie } = useMovieDetail();
  return (
    <button
      type="button"
      onClick={(event) => openMovie(movie, event.currentTarget)}
      tabIndex={pointerOnly ? -1 : undefined}
      aria-hidden={pointerOnly ? true : undefined}
      className={cx(
        "group w-full rounded-xl text-left transition-colors",
        "hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight",
        className,
      )}
    >
      {children}
    </button>
  );
}
