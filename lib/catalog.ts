import "server-only";

import { getSupabase } from "@/lib/supabase-server";
import type { CatalogMovie } from "@/types/movie";

/**
 * The only module that queries public.movies. Everything else (server
 * pages, route handlers) goes through these functions.
 */

const CATALOG_COLUMNS =
  "id, title, overview, release_year, runtime_min, vote_average, poster_path, backdrop_path, genres, director, top_cast";

const ROW_SIZE = 20;
export const MAX_IDS_PER_CALL = 100;
const SEARCH_LIMIT = 40;
const TOP_RATED_MIN_VOTES = 2000;
export const HOME_GENRES = ["Action", "Comedy", "Drama", "Science Fiction", "Horror"] as const;

export type HomeRow = { title: string; movies: CatalogMovie[] };

function movies() {
  return getSupabase().from("movies").select(CATALOG_COLUMNS);
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Catalog query failed: ${result.error.message}`);
  return result.data as T;
}

const DESC = { ascending: false, nullsFirst: false } as const;

export async function getHomeRows(): Promise<HomeRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const [trending, newReleases, topRated, ...genreRows] = await Promise.all([
    movies().order("popularity", DESC).limit(ROW_SIZE),
    movies().lte("release_date", today).order("release_date", DESC).limit(ROW_SIZE),
    movies()
      .gte("vote_count", TOP_RATED_MIN_VOTES)
      .order("vote_average", DESC)
      .order("vote_count", DESC)
      .limit(ROW_SIZE),
    ...HOME_GENRES.map((genre) =>
      movies().contains("genres", [genre]).order("popularity", DESC).limit(ROW_SIZE),
    ),
  ]);

  return [
    { title: "Trending Now", movies: unwrap(trending) },
    { title: "New Releases", movies: unwrap(newReleases) },
    { title: "Top Rated", movies: unwrap(topRated) },
    ...HOME_GENRES.map((genre, index) => ({ title: genre, movies: unwrap(genreRows[index]) })),
  ];
}

/** Rows for the given ids, in the order the ids were given. Missing ids are dropped. */
export async function getMoviesByIds(ids: number[]): Promise<CatalogMovie[]> {
  if (ids.length === 0) return [];
  if (ids.length > MAX_IDS_PER_CALL) {
    throw new Error(`getMoviesByIds accepts at most ${MAX_IDS_PER_CALL} ids`);
  }
  const rows = unwrap(await movies().in("id", ids));
  const byId = new Map(rows.map((movie) => [movie.id, movie]));
  return ids.map((id) => byId.get(id)).filter((movie): movie is CatalogMovie => Boolean(movie));
}

/** Escapes LIKE wildcards so user input matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Case-insensitive title match (served by the trigram index), most-voted first. */
export async function searchMovies(q: string, genre?: string): Promise<CatalogMovie[]> {
  let query = movies();
  if (q) query = query.ilike("title", `%${escapeLike(q)}%`);
  if (genre) query = query.contains("genres", [genre]);
  return unwrap(await query.order("vote_count", DESC).limit(SEARCH_LIMIT));
}

/** The n most-voted movies: the pool Rate and Recommend filter from. */
export async function getCandidatePool(n: number): Promise<CatalogMovie[]> {
  return unwrap(await movies().order("vote_count", DESC).limit(n));
}

export async function getGenres(): Promise<string[]> {
  const rows = unwrap(
    await getSupabase().from("movie_genres").select("name").order("name", { ascending: true }),
  );
  return rows.map((row) => row.name);
}
