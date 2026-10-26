import type { MovieInsert } from "@/types/database";

/**
 * TMDB fetching and mapping shared by the seed script (scripts/seed-movies.ts)
 * and import-on-miss (lib/catalog-admin.ts). Deliberately not "server-only",
 * because tsx scripts import it, but it must never be imported by client code:
 * it reads TMDB_READ_TOKEN.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const MAX_RETRIES = 2; // for errors other than 429
const MAX_RATE_LIMIT_WAITS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

/** Read at call time, so importing this module never requires the token. */
function tmdbToken(): string {
  const token = process.env.TMDB_READ_TOKEN;
  if (!token) throw new Error("TMDB_READ_TOKEN is not set (server-only env var; see .env.example)");
  return token;
}

/** GET a TMDB v4-token-authenticated endpoint. Waits out 429s; retries other failures twice. */
export async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = tmdbToken();
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let failures = 0;
  let rateLimitWaits = 0;
  for (;;) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.status === 429 && rateLimitWaits < MAX_RATE_LIMIT_WAITS) {
        rateLimitWaits += 1;
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1) * 1000);
        continue;
      }
      if (!res.ok) throw new HttpError(res.status);
      return (await res.json()) as T;
    } catch (error) {
      if (failures >= MAX_RETRIES) throw error;
      failures += 1;
      await sleep(500 * failures);
    }
  }
}

export type TmdbMovieDetails = {
  id: number;
  title: string;
  overview: string | null;
  release_date: string | null;
  runtime: number | null;
  vote_average: number | null;
  vote_count: number | null;
  popularity: number | null;
  original_language: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { name: string }[];
  credits?: {
    cast: { name: string; order: number }[];
    crew: { name: string; job: string }[];
  };
  keywords?: { keywords: { name: string }[] };
};

/** Maps TMDB details to the public.movies shape (types/movie.ts is the contract). */
export function toRow(details: TmdbMovieDetails, syncedAt: string): MovieInsert {
  const cast = [...(details.credits?.cast ?? [])].sort((a, b) => a.order - b.order);
  return {
    id: details.id,
    title: details.title,
    overview: details.overview || null,
    release_date: details.release_date || null,
    runtime_min: details.runtime || null,
    vote_average: details.vote_average,
    vote_count: details.vote_count,
    popularity: details.popularity,
    original_language: details.original_language,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    genres: details.genres.map((genre) => genre.name),
    keywords: (details.keywords?.keywords ?? []).map((keyword) => keyword.name),
    director: details.credits?.crew.find((member) => member.job === "Director")?.name ?? null,
    top_cast: cast.slice(0, 5).map((member) => member.name),
    tmdb_synced_at: syncedAt,
  };
}

/** One movie's details, credits and keywords, mapped to a public.movies row. */
export async function fetchMovieRow(id: number, syncedAt: string): Promise<MovieInsert> {
  const details = await tmdb<TmdbMovieDetails>(`/movie/${id}`, {
    append_to_response: "credits,keywords",
  });
  return toRow(details, syncedAt);
}
