import type { CatalogMovie } from "@/types/movie";

/** "2014 · 169 min · Drama, Science Fiction", skipping any part that's missing. */
export function formatMovieMeta(
  movie: Pick<CatalogMovie, "release_year" | "runtime_min" | "genres">,
): string {
  return [
    movie.release_year,
    movie.runtime_min === null ? null : `${movie.runtime_min} min`,
    movie.genres.length > 0 ? movie.genres.join(", ") : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}
