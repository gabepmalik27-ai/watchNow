import { describe, expect, it } from "vitest";
import {
  baseWeight,
  buildProfile,
  clampWeight,
  recencyDecay,
  shrunkMean,
} from "@/lib/recommender/profile";
import {
  INTERSTELLAR,
  NOW,
  THE_MARTIAN,
  TRANSFORMERS,
  byId,
  flatPercentile,
  movie,
  rated,
  row,
} from "./fixtures";

describe("shrunkMean", () => {
  it("is the prior with no ratings", () => {
    expect(shrunkMean([])).toBe(3.5);
  });

  it("adds two pseudo-ratings of 3.5", () => {
    expect(shrunkMean([5, 5])).toBeCloseTo(4.25); // (10 + 7) / 4
    expect(shrunkMean([5, 4, 1])).toBeCloseTo(3.4); // (10 + 7) / 5
  });
});

describe("baseWeight", () => {
  const mu = 3.4;

  it("rated → rating − mu, regardless of other flags", () => {
    expect(baseWeight(row(1, { rating: 5, on_watchlist: true, not_interested: true }), mu)).toBeCloseTo(1.6);
    expect(baseWeight(row(1, { rating: 1 }), mu)).toBeCloseTo(-2.4);
  });

  it("applies the fixed precedence for unrated rows", () => {
    expect(baseWeight(row(1, { not_interested: true, watched: true }), mu)).toBe(-1);
    expect(baseWeight(row(1, { watched: true, on_watchlist: true }), mu)).toBe(0.3);
    expect(baseWeight(row(1, { on_watchlist: true }), mu)).toBe(0.5);
    expect(baseWeight(row(1), mu)).toBe(0);
  });
});

describe("recencyDecay", () => {
  it("halves every 180 days and never exceeds 1", () => {
    expect(recencyDecay(NOW.toISOString(), NOW)).toBe(1);
    const halfLifeAgo = new Date(NOW.getTime() - 180 * 86_400_000).toISOString();
    expect(recencyDecay(halfLifeAgo, NOW)).toBeCloseTo(0.5);
    const future = new Date(NOW.getTime() + 86_400_000).toISOString();
    expect(recencyDecay(future, NOW)).toBe(1);
  });

  it("decays the profile weight", () => {
    const old = new Date(NOW.getTime() - 360 * 86_400_000).toISOString();
    const profile = buildProfile([rated(1, 5, old)], byId([movie(1)]), flatPercentile, NOW);
    // mu = (5 + 7) / 3 = 4; w = (5 − 4) · 0.25
    expect(profile.weights.get(1)).toBeCloseTo(0.25);
  });
});

describe("buildProfile", () => {
  const features = byId([INTERSTELLAR, THE_MARTIAN, TRANSFORMERS]);
  const rows = [rated(INTERSTELLAR.id, 5), rated(THE_MARTIAN.id, 4), rated(TRANSFORMERS.id, 1)];

  it("Interstellar 5 / Martian 4 / Transformers 1: weights clamp to ±1.5, sci-fi stays mildly positive, space keywords positive", () => {
    const profile = buildProfile(rows, features, flatPercentile, NOW);
    expect(profile.mu).toBeCloseTo(3.4);
    // Unclamped: +1.6, +0.6, −2.4. WEIGHT_CLIP limits both extremes to 1.5.
    expect(profile.weights.get(INTERSTELLAR.id)).toBeCloseTo(1.5);
    expect(profile.weights.get(THE_MARTIAN.id)).toBeCloseTo(0.6);
    expect(profile.weights.get(TRANSFORMERS.id)).toBeCloseTo(-1.5);

    // (1.5 + 0.6 − 1.5) / (3 + 2). Without the clamp it would be −0.04.
    expect(profile.affinity.genre.get("Science Fiction")).toBeCloseTo(0.12);

    expect(profile.affinity.keyword.get("space")).toBeCloseTo(0.525); // 2.1 / (2 + 2)
    expect(profile.affinity.keyword.get("astronaut")).toBeGreaterThan(0);
    expect(profile.affinity.keyword.get("robot")).toBeCloseTo(-0.5); // −1.5 / (1 + 2)
  });

  it("8 sci-fi films at 5★ plus Transformers at 1★ keep a clearly positive Science Fiction affinity", () => {
    const loved = Array.from({ length: 8 }, (_, i) =>
      movie(100 + i, { genres: ["Science Fiction", i % 2 ? "Drama" : "Adventure"] }),
    );
    const profile = buildProfile(
      [...loved.map((m) => rated(m.id, 5)), rated(TRANSFORMERS.id, 1)],
      byId([...loved, TRANSFORMERS]),
      flatPercentile,
      NOW,
    );
    // mu = (40 + 1 + 7) / 11 = 4.3636; each 5★ → +0.6364; Transformers 1 − 4.3636 = −3.36 → −1.5.
    expect(profile.weights.get(TRANSFORMERS.id)).toBe(-1.5);
    const scifi = profile.affinity.genre.get("Science Fiction") ?? NaN;
    expect(scifi).toBeCloseTo((8 * (5 - 48 / 11) - 1.5) / (9 + 2)); // 0.3264
    expect(scifi).toBeGreaterThan(0.3);
    // The clamp is what keeps it there: unclamped it would be about half.
    const unclamped = (8 * (5 - 48 / 11) + (1 - 48 / 11)) / 11;
    expect(scifi).toBeGreaterThan(2 * unclamped);
  });

  it("clamps every weight to ±WEIGHT_CLIP", () => {
    expect(clampWeight(4)).toBe(1.5);
    expect(clampWeight(-4)).toBe(-1.5);
    expect(clampWeight(0.3)).toBe(0.3);
  });

  it("gives cast half weight and counts only the top 3 billed", () => {
    const profile = buildProfile(rows, features, flatPercentile, NOW);
    // Jessica Chastain: 4th in Interstellar (ignored), 2nd in The Martian.
    expect(profile.affinity.cast.get("Jessica Chastain")).toBeCloseTo((0.5 * 0.6) / (1 + 2));
    expect(profile.affinity.cast.get("Matthew McConaughey")).toBeCloseTo((0.5 * 1.5) / (1 + 2));
    expect(profile.affinity.director.get("Christopher Nolan")).toBeCloseTo(1.5 / 3);
  });

  it("lists positive rated movies as anchors, best first", () => {
    const profile = buildProfile(rows, features, flatPercentile, NOW);
    expect(profile.anchors.map((a) => a.movieId)).toEqual([INTERSTELLAR.id, THE_MARTIAN.id]);
    expect(profile.ratedCount).toBe(3);
  });

  it("pUser is the mean percentile of positively weighted movies, 0.5 when none", () => {
    const pct = (popularity: number | null) => (popularity === 80 ? 0.9 : 0.1);
    const pool = byId([movie(1, { popularity: 80 }), movie(2, { popularity: 5 }), movie(3, { popularity: 80 })]);
    const profile = buildProfile(
      [row(1, { on_watchlist: true }), row(2, { watched: true }), row(3, { not_interested: true })],
      pool,
      pct,
      NOW,
    );
    expect(profile.pUser).toBeCloseTo((0.9 + 0.1) / 2);
    expect(buildProfile([], pool, pct, NOW).pUser).toBe(0.5);
  });

  it("ignores row order", () => {
    const a = buildProfile(rows, features, flatPercentile, NOW);
    const b = buildProfile([...rows].reverse(), features, flatPercentile, NOW);
    expect([...b.affinity.keyword]).toEqual([...a.affinity.keyword]);
    expect(b.mu).toBe(a.mu);
  });
});
