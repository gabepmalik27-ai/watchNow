/** One row of public.movies (supabase/migrations/0001_movies.sql). */
export type Movie = {
  id: number; // TMDB id, primary key of public.movies
  title: string;
  overview: string | null;
  release_date: string | null; // ISO yyyy-mm-dd
  release_year: number | null; // generated from release_date
  runtime_min: number | null;
  vote_average: number | null; // 0–10, as TMDB returns it
  vote_count: number | null;
  popularity: number | null;
  original_language: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: string[];
  keywords: string[];
  director: string | null;
  top_cast: string[];
  tmdb_synced_at: string; // ISO timestamp
};

/** The columns lib/catalog.ts selects for the UI. A full Movie is assignable to it. */
export type CatalogMovie = Pick<
  Movie,
  | "id"
  | "title"
  | "overview"
  | "release_year"
  | "runtime_min"
  | "vote_average"
  | "poster_path"
  | "backdrop_path"
  | "genres"
  | "director"
  | "top_cast"
>;

export type UserMovie = {
  movie_id: number;
  watched: boolean;
  rating: number | null; // 0.5–5.0 in 0.5 steps, null if unrated
  not_interested: boolean;
  on_watchlist: boolean; // wants to watch later; cleared once watched
};

/** One row of public.user_movies (supabase/migrations/0002_accounts.sql). */
export type UserMovieRow = UserMovie & {
  user_id: string; // auth.users id
  updated_at: string; // ISO timestamp
};

/** One row of public.profiles (supabase/migrations/0002_accounts.sql). */
export type Profile = {
  id: string; // auth.users id
  display_name: string;
  created_at: string; // ISO timestamp
};
