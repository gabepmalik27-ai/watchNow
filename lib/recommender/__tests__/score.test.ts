import { describe, expect, it } from "vitest";
import { FOR_YOU_WEIGHTS, RECOMMEND_WEIGHTS, FEATURES } from "@/lib/recommender/constants";
import {
  bayesianRating,
  makePercentile,
  meanVoteAverage,
  minMaxNormalize,
  qualityScore,
  rarityFit,
  rawMatches,
} from "@/lib/recommender/features";
import { buildProfile } from "@/lib/recommender/profile";
import {
  applyDirectorCap,
  effectiveWeights,
  scoreCandidates,
  type ScoredCandidate,
} from "@/lib/recommender/score";
import {
  INTERSTELLAR,
  NOW,
  THE_MARTIAN,
  TRANSFORMERS,
  byId,
  flatPercentile,
  movie,
  rated,
} from "./fixtures";

const sum = (weights: Record<string, number>) => Object.values(weights).reduce((a, b) => a + b, 0);

describe("makePercentile", () => {
  const pct = makePercentile([10, 20, 30, 40, null]);

  it("maps the least popular to 0 and the most popular to 1", () => {
    expect(pct(0)).toBe(0); // the null counts as 0
    expect(pct(40)).toBe(1); // 4 values below / (5 − 1)
    expect(pct(20)).toBe(0.5); // 0, 10 below → 2 / 4
  });

  it("handles values outside the pool and null", () => {
    expect(pct(1000)).toBe(1);
    expect(pct(-5)).toBe(0);
    expect(pct(null)).toBe(0);
    expect(pct(25)).toBe(0.75);
  });
});

describe("rawMatches", () => {
  const profile = buildProfile(
    [rated(INTERSTELLAR.id, 5), rated(THE_MARTIAN.id, 4), rated(TRANSFORMERS.id, 1)],
    byId([INTERSTELLAR, THE_MARTIAN, TRANSFORMERS]),
    flatPercentile,
    NOW,
  );

  it("sums keyword affinity over sqrt(count), means genres, adds director + mean cast", () => {
    const gravity = movie(49047, {
      keywords: ["space", "astronaut", "zero gravity", "survival"],
      genres: ["Science Fiction", "Thriller"],
      director: "Ridley Scott",
      top_cast: ["Matt Damon", "Nobody", "Also Nobody", "Ignored Fourth"],
    });
    const raw = rawMatches(gravity, profile.affinity);
    const kw = profile.affinity.keyword;
    const expectedKeyword =
      ((kw.get("space") ?? 0) + (kw.get("astronaut") ?? 0) + (kw.get("survival") ?? 0)) / Math.sqrt(4);
    expect(raw.keyword).toBeCloseTo(expectedKeyword);
    expect(raw.genre).toBeCloseTo((profile.affinity.genre.get("Science Fiction") ?? 0) / 2);
    const scott = profile.affinity.director.get("Ridley Scott") ?? 0;
    const damon = profile.affinity.cast.get("Matt Damon") ?? 0;
    expect(raw.people).toBeCloseTo(scott + damon / 3);
  });

  it("is 0 for a movie with no traits", () => {
    expect(rawMatches(movie(1), profile.affinity)).toEqual({ keyword: 0, genre: 0, people: 0 });
  });
});

describe("minMaxNormalize", () => {
  it("scales to 0–1 and returns 0s when flat", () => {
    expect(minMaxNormalize([-2, 0, 2])).toEqual([0, 0.5, 1]);
    expect(minMaxNormalize([3, 3])).toEqual([0, 0]);
    expect(minMaxNormalize([])).toEqual([]);
  });
});

describe("Bayesian quality", () => {
  it("is the pool mean with no votes and approaches R with many", () => {
    expect(bayesianRating(9, 0, 6.5)).toBe(6.5);
    expect(bayesianRating(9, 1_000_000_000, 6.5)).toBeCloseTo(9, 4);
    expect(bayesianRating(8, 1000, 6)).toBe(7); // equal weight at v = m
  });

  it("maps 5 → 0 and 9 → 1, clamped", () => {
    expect(qualityScore(movie(1, { vote_average: 7, vote_count: 1000 }), 7)).toBe(0.5);
    expect(qualityScore(movie(1, { vote_average: 10, vote_count: 1e9 }), 7)).toBe(1);
    expect(qualityScore(movie(1, { vote_average: 2, vote_count: 1e9 }), 7)).toBe(0);
    expect(qualityScore(movie(1, { vote_average: null, vote_count: null }), 6)).toBe(0.25);
  });

  it("meanVoteAverage skips nulls", () => {
    expect(meanVoteAverage([movie(1, { vote_average: 6 }), movie(2, { vote_average: null }), movie(3, { vote_average: 8 })])).toBe(7);
  });
});

describe("rarityFit", () => {
  it("is 1 at the target and falls off linearly", () => {
    expect(rarityFit(0.3, 0.3)).toBe(1);
    expect(rarityFit(1, 0)).toBe(0);
    expect(rarityFit(0.25, 0.75)).toBe(0.5);
  });
});

describe("effectiveWeights", () => {
  it("always sums to 1", () => {
    for (const base of [FOR_YOU_WEIGHTS, RECOMMEND_WEIGHTS]) {
      for (const coldStart of [true, false]) {
        for (const hasContext of [true, false]) {
          expect(sum(effectiveWeights(base, { coldStart, hasContext }))).toBeCloseTo(1);
        }
      }
    }
  });

  it("cold start zeroes keyword/genre/people and keeps the ratio of the rest", () => {
    const w = effectiveWeights(FOR_YOU_WEIGHTS, { coldStart: true, hasContext: false });
    expect(w.keyword).toBe(0);
    expect(w.genre).toBe(0);
    expect(w.people).toBe(0);
    expect(w.quality).toBeCloseTo(0.6);
    expect(w.rarity).toBeCloseTo(0.4);
  });

  it("drops context when none is chosen", () => {
    const w = effectiveWeights(RECOMMEND_WEIGHTS, { coldStart: false, hasContext: false });
    expect(w.context).toBe(0);
    expect(w.keyword).toBeCloseTo(0.15 / 0.6);
    const withContext = effectiveWeights(RECOMMEND_WEIGHTS, { coldStart: true, hasContext: true });
    expect(withContext.context).toBeCloseTo(0.4 / 0.65);
  });
});

describe("scoreCandidates", () => {
  const profile = buildProfile(
    [rated(INTERSTELLAR.id, 5), rated(THE_MARTIAN.id, 4), rated(TRANSFORMERS.id, 1)],
    byId([INTERSTELLAR, THE_MARTIAN, TRANSFORMERS]),
    flatPercentile,
    NOW,
  );
  const spaceMovie = movie(10, { keywords: ["space", "astronaut"], genres: ["Science Fiction"] });
  const robotMovie = movie(11, { keywords: ["robot", "alien"], genres: ["Science Fiction"] });
  const plain = movie(12, { genres: ["Comedy"] });
  const candidates = [plain, robotMovie, spaceMovie];
  const weights = effectiveWeights(FOR_YOU_WEIGHTS, { coldStart: false, hasContext: false });
  const options = {
    candidates,
    profile,
    popularityPercentile: flatPercentile,
    poolMean: 7,
    weights,
    coldStart: false,
    rarityTarget: 0.5,
  };

  it("ranks the space movie above the robot movie, and contributions sum to the score", () => {
    const result = scoreCandidates(options);
    const order = result.map((r) => r.movie.id);
    expect(order[0]).toBe(10);
    expect(order.indexOf(10)).toBeLessThan(order.indexOf(11));
    for (const { breakdown } of result) {
      const contributionSum = FEATURES.reduce((s, f) => s + breakdown.contributions[f], 0);
      expect(contributionSum).toBeCloseTo(breakdown.score);
      expect(breakdown.score).toBeGreaterThanOrEqual(0);
      expect(breakdown.score).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic regardless of candidate order", () => {
    const a = scoreCandidates(options);
    const b = scoreCandidates({ ...options, candidates: [...candidates].reverse() });
    expect(b).toEqual(a);
  });

  it("breaks ties by quality, then id", () => {
    const tied = [movie(3), movie(2), movie(1, { vote_average: 8 })];
    const result = scoreCandidates({ ...options, candidates: tied, weights: effectiveWeights(FOR_YOU_WEIGHTS, { coldStart: true, hasContext: false }) });
    expect(result.map((r) => r.movie.id)).toEqual([1, 2, 3]);
  });
});

describe("applyDirectorCap", () => {
  const make = (id: number, director: string | null): ScoredCandidate =>
    ({ movie: movie(id, { director }) }) as ScoredCandidate;

  it("keeps at most two per director and fills from further down", () => {
    const sorted = [make(1, "Nolan"), make(2, "Nolan"), make(3, "Nolan"), make(4, null), make(5, "Scott")];
    expect(applyDirectorCap(sorted, 4, 2).map((c) => c.movie.id)).toEqual([1, 2, 4, 5]);
  });

  it("never caps movies without a director", () => {
    const sorted = [make(1, null), make(2, null), make(3, null)];
    expect(applyDirectorCap(sorted, 3, 2)).toHaveLength(3);
  });
});
