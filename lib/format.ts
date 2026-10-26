import type { CatalogMovie, SearchResult } from "@/types/movie";

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

/** Why a search result matched a person: "Directed by X" / "Stars X". Title matches get none. */
export function formatMatchHint(result: Pick<SearchResult, "match_kind" | "match_person">): string | null {
  if (!result.match_person) return null;
  if (result.match_kind === "director") return `Directed by ${result.match_person}`;
  if (result.match_kind === "cast") return `Stars ${result.match_person}`;
  return null;
}
