import { describe, expect, it } from "vitest";
import {
  genresByWatchCount,
  ratingDistribution,
  topGenresByRating,
} from "@/lib/profile-stats";
import type { UserMovie } from "@/types/movie";

function um(movieId: number, overrides: Partial<UserMovie> = {}): UserMovie {
  return { movie_id: movieId, watched: false, rating: null, not_interested: false, on_watchlist: false, ...overrides };
}
const rated = (id: number, rating: number) => um(id, { rating, watched: true });

const genres = new Map<number, string[]>([
  [1, ["Drama", "Science Fiction"]],
  [2, ["Drama"]],
  [3, ["Comedy"]],
  [4, ["Comedy", "Drama"]],
  [5, ["Horror"]],
  [6, ["Science Fiction", "Science Fiction"]], // duplicate genre counts once
]);

describe("topGenresByRating", () => {
  it("averages ratings per genre and ranks high to low", () => {
    const result = topGenresByRating([rated(1, 10), rated(2, 8), rated(3, 4), rated(4, 6), rated(6, 9)], genres);
    expect(result).toEqual([
      { genre: "Science Fiction", average: 9.5, count: 2 },
      { genre: "Drama", average: 8, count: 3 },
      { genre: "Comedy", average: 5, count: 2 },
    ]);
  });

  it("needs at least 2 ratings per genre and ignores unrated movies", () => {
    const result = topGenresByRating([rated(5, 10), um(1, { watched: true }), rated(3, 8)], genres);
    expect(result).toEqual([]);
  });

  it("breaks ties by count, then name, and respects the limit", () => {
    const result = topGenresByRating([rated(1, 8), rated(2, 8), rated(6, 8), rated(4, 8), rated(3, 8)], genres, 2);
    expect(result.map((g) => g.genre)).toEqual(["Drama", "Comedy"]); // Comedy and Sci-Fi tie on 8.0 × 2
  });
});

describe("genresByWatchCount", () => {
  it("counts watched movies per genre, watched or rated alike, not watchlist", () => {
    const result = genresByWatchCount(
      [rated(1, 10), um(2, { watched: true }), um(4, { watched: true }), um(3, { on_watchlist: true }), um(6, { watched: true })],
      genres,
    );
    expect(result).toEqual([
      { genre: "Drama", count: 3 },
      { genre: "Science Fiction", count: 2 },
      { genre: "Comedy", count: 1 },
    ]);
  });

  it("skips movies whose genres aren't loaded yet", () => {
    expect(genresByWatchCount([um(99, { watched: true })], genres)).toEqual([]);
  });
});

describe("ratingDistribution", () => {
  it("returns all ten values 1–10 with counts", () => {
    const result = ratingDistribution([rated(1, 10), rated(2, 10), rated(3, 1), rated(4, 7), um(5)]);
    expect(result).toHaveLength(10);
    expect(result.map((b) => b.rating)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result[0]).toEqual({ rating: 1, count: 1 });
    expect(result.find((b) => b.rating === 7)?.count).toBe(1);
    expect(result[9]).toEqual({ rating: 10, count: 2 });
    expect(result.reduce((s, b) => s + b.count, 0)).toBe(4);
  });
});
