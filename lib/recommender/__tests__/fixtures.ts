import type { RecMovie, RecUserRow } from "@/types/movie";

export const NOW = new Date("2026-10-01T00:00:00.000Z");
export const NOW_ISO = NOW.toISOString();

/** A pool movie with neutral defaults; override only what a test cares about. */
export function movie(id: number, overrides: Partial<RecMovie> = {}): RecMovie {
  return {
    id,
    title: `Movie ${id}`,
    genres: [],
    keywords: [],
    director: null,
    top_cast: [],
    vote_average: 7,
    vote_count: 5000,
    popularity: 10,
    runtime_min: 110,
    poster_path: null,
    backdrop_path: null,
    release_year: 2015,
    ...overrides,
  };
}

export function row(movieId: number, overrides: Partial<RecUserRow> = {}): RecUserRow {
  return {
    movie_id: movieId,
    watched: false,
    rating: null,
    on_watchlist: false,
    not_interested: false,
    updated_at: NOW_ISO,
    ...overrides,
  };
}

export function rated(movieId: number, rating: number, updatedAt = NOW_ISO): RecUserRow {
  return row(movieId, { rating, watched: true, updated_at: updatedAt });
}

export function byId(movies: readonly RecMovie[]): Map<number, RecMovie> {
  return new Map(movies.map((m) => [m.id, m]));
}

export const flatPercentile = () => 0.5;

/** Interstellar 5 / The Martian 4 / Transformers 1, with simplified real metadata. */
export const INTERSTELLAR = movie(157336, {
  title: "Interstellar",
  genres: ["Adventure", "Drama", "Science Fiction"],
  keywords: ["space", "astronaut", "wormhole", "black hole", "space travel"],
  director: "Christopher Nolan",
  top_cast: ["Matthew McConaughey", "Anne Hathaway", "Michael Caine", "Jessica Chastain"],
});
export const THE_MARTIAN = movie(286217, {
  title: "The Martian",
  genres: ["Drama", "Adventure", "Science Fiction"],
  keywords: ["space", "astronaut", "mars", "survival", "space travel"],
  director: "Ridley Scott",
  top_cast: ["Matt Damon", "Jessica Chastain", "Kristen Wiig"],
});
export const TRANSFORMERS = movie(1858, {
  title: "Transformers",
  genres: ["Adventure", "Science Fiction", "Action"],
  keywords: ["robot", "alien", "based on toy", "military"],
  director: "Michael Bay",
  top_cast: ["Shia LaBeouf", "Megan Fox", "Josh Duhamel"],
});
