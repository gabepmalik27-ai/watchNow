import type { Movie } from "@/types/movie";

/**
 * Hand-written Supabase schema type for the tables WatchNow uses. Keeps
 * supabase-js queries typed (column names are checked) without codegen.
 * Must match supabase/migrations/.
 */
export type MovieInsert = Omit<Movie, "release_year" | "tmdb_synced_at"> & {
  tmdb_synced_at?: string;
};

export type Database = {
  public: {
    Tables: {
      movies: {
        Row: Movie;
        Insert: MovieInsert;
        Update: Partial<MovieInsert>;
        Relationships: [];
      };
    };
    Views: {
      movie_genres: {
        Row: { name: string };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
