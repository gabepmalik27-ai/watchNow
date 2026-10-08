"use client";

// Client component because next/image only accepts a loader function prop
// in client code (functions can't be serialized from server to client).

import Image from "next/image";
import { cx } from "@/lib/cx";
import { tmdbImageLoader } from "@/lib/tmdb-image";
import type { CatalogMovie } from "@/types/movie";

/**
 * Fallback palette for movies with no poster_path. Deterministic per movie
 * id — intentionally not part of the design token system in globals.css.
 */
const POSTER_PALETTE = [
  "#A9623A", // rust
  "#8C8CB0", // slate purple
  "#A34B49", // brick
  "#D9772E", // orange
  "#5C7A8A", // blue-gray
  "#4F7A63", // sage
  "#B99C6B", // tan
  "#6B5B95", // plum
];

function paletteColorForId(id: number): string {
  const index = Math.abs(id) % POSTER_PALETTE.length;
  return POSTER_PALETTE[index];
}

/** Matches the card widths in MovieRow (w-36 / sm:w-40) and the grids. */
const DEFAULT_SIZES = "(min-width: 768px) 192px, 50vw";

type PosterBlockProps = {
  movie: Pick<CatalogMovie, "id" | "title" | "poster_path">;
  /** next/image `sizes`: how wide the poster renders, so the right TMDB size is picked. */
  sizes?: string;
  className?: string;
};

export function PosterBlock({ movie, sizes = DEFAULT_SIZES, className }: PosterBlockProps) {
  if (!movie.poster_path) {
    return (
      <div
        aria-hidden="true"
        className={cx("aspect-[2/3] w-full rounded-xl", className)}
        style={{ backgroundColor: paletteColorForId(movie.id) }}
      />
    );
  }

  return (
    <div
      className={cx("relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-raised", className)}
    >
      <Image
        loader={tmdbImageLoader}
        src={movie.poster_path}
        alt={`${movie.title} poster`}
        fill
        sizes={sizes}
        className="object-cover"
      />
    </div>
  );
}
