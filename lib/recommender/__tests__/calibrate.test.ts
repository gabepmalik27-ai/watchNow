import { describe, expect, it } from "vitest";
import { calibrate, genreCredits, l1Distance, mixOf } from "@/lib/recommender/calibrate";
import { genreTarget } from "@/lib/recommender/profile";
import { applyDirectorCap, type ScoredCandidate } from "@/lib/recommender/score";
import { NOW, byId, movie, rated, row } from "./fixtures";
import type { RecMovie } from "@/types/movie";

const POOL_GENRES = ["Comedy", "Crime"];

/** 30 watched comedies (ids 1–30) and 10 watched crime films (ids 31–40). */
const history = [
  ...Array.from({ length: 30 }, (_, i) => movie(1 + i, { genres: ["Comedy"] })),
  ...Array.from({ length: 10 }, (_, i) => movie(31 + i, { genres: ["Crime"] })),
];
const watchedRows = history.map((m) => row(m.id, { watched: true }));

/**
 * 120 candidates, comedy and crime alternating down a smoothly falling score,
 * so pure score order is half and half.
 */
function candidates(): ScoredCandidate[] {
  return Array.from({ length: 120 }, (_, i) => {
    const m: RecMovie = movie(1000 + i, {
      genres: [i % 2 === 0 ? "Crime" : "Comedy"],
      director: `Director ${i}`,
    });
    return {
      movie: m,
      breakdown: { score: 1 - i / 200, features: { quality: 0.5 } },
    } as ScoredCandidate;
  });
}

const share = (list: ScoredCandidate[], genre: string) => mixOf(list.map((c) => c.movie)).get(genre) ?? 0;

describe("genre credits and mixes", () => {
  it("gives each of a movie's k genres 1/k", () => {
    expect(genreCredits({ genres: ["Comedy", "Crime", "Comedy"] })).toEqual(
      new Map([
        ["Comedy", 0.5],
        ["Crime", 0.5],
      ]),
    );
  });

  it("L1 is 0 for equal mixes and 2 for disjoint ones", () => {
    const a = new Map([["Comedy", 1]]);
    expect(l1Distance(a, a)).toBe(0);
    expect(l1Distance(a, new Map([["Crime", 1]]))).toBe(2);
  });
});

describe("genreTarget", () => {
  it("30 comedies + 10 crime → 0.9·0.75 + 0.1·½ = 0.725 comedy", () => {
    const p = genreTarget(watchedRows, byId(history), NOW, POOL_GENRES);
    expect(p.get("Comedy")).toBeCloseTo(0.725);
    expect(p.get("Crime")).toBeCloseTo(0.275);
  });

  it("counts watched movies whether rated or not, and ignores unwatched ones", () => {
    const rows = [rated(1, 8), row(31, { watched: true }), row(32, { on_watchlist: true }), row(33, { not_interested: true })];
    const p = genreTarget(rows, byId(history), NOW, POOL_GENRES);
    expect(p.get("Comedy")).toBeCloseTo(0.9 * 0.5 + 0.05);
  });

  it("a disliked comedy still raises comedy's target share", () => {
    const base = genreTarget(watchedRows, byId(history), NOW, POOL_GENRES);
    const extra = movie(41, { genres: ["Comedy"] });
    const withDislike = genreTarget(
      [...watchedRows, rated(41, 1)],
      byId([...history, extra]),
      NOW,
      POOL_GENRES,
    );
    expect(withDislike.get("Comedy") ?? 0).toBeGreaterThan(base.get("Comedy") ?? 0);
  });

  it("is empty with no watched movies", () => {
    expect(genreTarget([], byId(history), NOW, POOL_GENRES).size).toBe(0);
  });
});

describe("calibrate", () => {
  const p = genreTarget(watchedRows, byId(history), NOW, POOL_GENRES);

  it("pulls a 20-item list to the 75% comedy history (± 0.1)", () => {
    const pure = applyDirectorCap(candidates(), 20, 2);
    expect(share(pure, "Comedy")).toBeCloseTo(0.5);
    const { results } = calibrate(candidates(), p, 20, 0.5, 2);
    expect(results).toHaveLength(20);
    expect(Math.abs(share(results, "Comedy") - 0.75)).toBeLessThanOrEqual(0.1);
  });

  it("lambda 0 is exactly the score order (with the director cap)", () => {
    const list = candidates().map((c, i) =>
      i < 6 ? { ...c, movie: { ...c.movie, director: "Same Director" } } : c,
    );
    const pure = applyDirectorCap(list, 20, 2).map((c) => c.movie.id);
    expect(calibrate(list, p, 20, 0, 2).results.map((c) => c.movie.id)).toEqual(pure);
  });

  it("is deterministic on shuffled input", () => {
    const a = calibrate(candidates(), p, 20, 0.5, 2).results.map((c) => c.movie.id);
    const shuffled = candidates().sort((x, y) => ((x.movie.id * 7919) % 101) - ((y.movie.id * 7919) % 101));
    expect(calibrate(shuffled, p, 20, 0.5, 2).results.map((c) => c.movie.id)).toEqual(a);
  });

  it("only re-ranks the top CALIBRATION_CANDIDATES", () => {
    const { results } = calibrate(candidates(), p, 200, 0.5, 2);
    expect(results).toHaveLength(100);
  });
});
