import type { CatalogMovie } from "@/types/movie";

/** TMDB's 0–10 vote average shown on WatchNow's 5-star scale, or "—" when unknown. */
export function formatAudienceRating(voteAverage: number | null): string {
  return voteAverage === null ? "—" : (voteAverage / 2).toFixed(1);
}

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
