import { describe, expect, it } from "vitest";
import { rankForContext, rankForYou } from "@/lib/recommender";
import { INTERSTELLAR, NOW, THE_MARTIAN, TRANSFORMERS, movie, rated, row } from "./fixtures";

/** A deterministic synthetic pool: varied genres, runtimes and popularity. */
const GENRE_SETS = [
  ["Science Fiction", "Adventure"],
  ["Comedy", "Family"],
  ["Horror", "Thriller"],
  ["Drama", "Romance"],
  ["Animation", "Comedy"],
  ["Action", "Thriller"],
];
const KEYWORD_SETS = [["space", "astronaut"], ["parody"], ["serial killer"], ["love"], ["friendship"], ["heist"]];
const pool = [
  INTERSTELLAR,
  THE_MARTIAN,
  TRANSFORMERS,
  ...Array.from({ length: 120 }, (_, i) =>
    movie(1000 + i, {
      genres: GENRE_SETS[i % 6],
      keywords: KEYWORD_SETS[i % 6],
      runtime_min: i % 7 === 0 ? null : 70 + ((i * 13) % 100),
      popularity: 1 + ((i * 37) % 200),
      vote_average: 5.5 + ((i * 7) % 30) / 10,
      vote_count: 500 + ((i * 101) % 20000),
      director: `Director ${i % 15}`,
    }),
  ),
];
const sciFiRows = [rated(INTERSTELLAR.id, 5), rated(THE_MARTIAN.id, 4.5), rated(TRANSFORMERS.id, 1)];
const base = { pool, userFeatures: [], now: NOW };

describe("rankForYou", () => {
  it("excludes rated, watched, watchlisted and not-interested movies", () => {
    const rows = [
      ...sciFiRows,
      row(1000, { watched: true }),
      row(1001, { on_watchlist: true }),
      row(1002, { not_interested: true }),
    ];
    const ids = rankForYou({ ...base, rows, limit: 200 }).results.map((r) => r.movieId);
    for (const id of [INTERSTELLAR.id, THE_MARTIAN.id, TRANSFORMERS.id, 1000, 1001, 1002]) {
      expect(ids).not.toContain(id);
    }
  });

  it("puts liked-keyword sci-fi first once personalized", () => {
    const { results, coldStart } = rankForYou({ ...base, rows: sciFiRows, limit: 5 });
    expect(coldStart).toBe(false);
    expect(results[0].reason).toMatch(/^Because you loved/);
    // Sci-fi candidates are ids where (id − 1000) % 6 === 0.
    expect(results.filter((r) => (r.movieId - 1000) % 6 === 0).length).toBeGreaterThanOrEqual(3);
  });

  it("is cold start below 3 ratings, with only quality and rarity weighted", () => {
    const { results, coldStart } = rankForYou({ ...base, rows: [rated(INTERSTELLAR.id, 5)], limit: 5 });
    expect(coldStart).toBe(true);
    for (const r of results) {
      expect(r.breakdown.weights.keyword).toBe(0);
      expect(r.reason).toBe("Popular and highly rated");
    }
  });

  it("caps directors at 2", () => {
    const { results } = rankForYou({ ...base, rows: sciFiRows, limit: 40 });
    const counts = new Map<string, number>();
    for (const r of results) {
      const director = pool.find((m) => m.id === r.movieId)?.director ?? "";
      counts.set(director, (counts.get(director) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it("is deterministic: shuffled pool and rows give identical output", () => {
    const a = rankForYou({ ...base, rows: sciFiRows, limit: 20 });
    const shuffled = [...pool].sort((x, y) => ((x.id * 7919) % 101) - ((y.id * 7919) % 101));
    const b = rankForYou({ ...base, pool: shuffled, rows: [...sciFiRows].reverse(), limit: 20 });
    expect(b).toEqual(a);
  });
});

describe("rankForContext", () => {
  it("never returns a movie longer than 90 minutes for <90 (or with null runtime)", () => {
    const { results } = rankForContext({
      ...base,
      rows: sciFiRows,
      limit: 200,
      context: { mood: "Funny", experience: null, time: "<90", discovery: 50 },
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      const runtime = pool.find((m) => m.id === r.movieId)?.runtime_min;
      expect(runtime).not.toBeNull();
      expect(runtime as number).toBeLessThanOrEqual(90);
    }
  });

  it("Surprise Me shifts results toward less popular movies", () => {
    const run = (discovery: number) =>
      rankForContext({
        ...base,
        rows: sciFiRows,
        limit: 5,
        context: { mood: null, experience: null, time: null, discovery },
      }).results.map((r) => r.breakdown.popularityPercentile);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(run(100))).toBeLessThan(mean(run(0)));
  });
});
