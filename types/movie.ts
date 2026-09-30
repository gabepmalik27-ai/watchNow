export type Movie = {
  id: number; // TMDB id — this is the real primary key later
  title: string;
  release_year: number;
  runtime_min: number;
  overview: string;
  vote_average: number; // 0–10, as TMDB returns it
  genres: string[];
};

export type UserMovie = {
  movie_id: number;
  watched: boolean;
  rating: number | null; // 0.5–5.0 in 0.5 steps, null if unrated
  not_interested: boolean;
};

export type UserProfile = {
  name: string;
  watched_count: number;
  rated_count: number;
  average_rating: number;
  watchlist_count: number;
};
