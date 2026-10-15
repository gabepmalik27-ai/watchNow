import { describe, expect, it } from "vitest";
import {
  baseWeight,
  buildProfile,
  clampWeight,
  ratedBaseWeight,
  recencyDecay,
  shrunkMean,
} from "@/lib/recommender/profile";
import { crowdScore5, surpriseOffset } from "@/lib/recommender/features";
import {
  INTERSTELLAR,
  FIXTURE_POOL_MEAN,
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
    const profile = buildProfile([rated(1, 5, old)], byId([movie(1)]), flatPercentile, NOW, FIXTURE_POOL_MEAN);
    // mu = (5 + 7) / 3 = 4; w = (5 − 4) · 0.25
    expect(profile.weights.get(1)).toBeCloseTo(0.25);
  });
});

describe("buildProfile", () => {
  const features = byId([INTERSTELLAR, THE_MARTIAN, TRANSFORMERS]);
  const rows = [rated(INTERSTELLAR.id, 5), rated(THE_MARTIAN.id, 4), rated(TRANSFORMERS.id, 1)];

  it("Interstellar 5 / Martian 4 / Transformers 1: weights clamp to ±1.5, sci-fi stays mildly positive, space keywords positive", () => {
    const profile = buildProfile(rows, features, flatPercentile, NOW, FIXTURE_POOL_MEAN);
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
      FIXTURE_POOL_MEAN,
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
    const profile = buildProfile(rows, features, flatPercentile, NOW, FIXTURE_POOL_MEAN);
    // Jessica Chastain: 4th in Interstellar (ignored), 2nd in The Martian.
    expect(profile.affinity.cast.get("Jessica Chastain")).toBeCloseTo((0.5 * 0.6) / (1 + 2));
    expect(profile.affinity.cast.get("Matthew McConaughey")).toBeCloseTo((0.5 * 1.5) / (1 + 2));
    expect(profile.affinity.director.get("Christopher Nolan")).toBeCloseTo(1.5 / 3);
  });

  it("lists positive rated movies as anchors, best first", () => {
    const profile = buildProfile(rows, features, flatPercentile, NOW, FIXTURE_POOL_MEAN);
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
      FIXTURE_POOL_MEAN,
    );
    expect(profile.pUser).toBeCloseTo((0.9 + 0.1) / 2);
    expect(buildProfile([], pool, pct, NOW, FIXTURE_POOL_MEAN).pUser).toBe(0.5);
  });

  it("ignores row order", () => {
    const a = buildProfile(rows, features, flatPercentile, NOW, FIXTURE_POOL_MEAN);
    const b = buildProfile([...rows].reverse(), features, flatPercentile, NOW, FIXTURE_POOL_MEAN);
    expect([...b.affinity.keyword]).toEqual([...a.affinity.keyword]);
    expect(b.mu).toBe(a.mu);
  });
});

describe("surprise-adjusted weights (T24)", () => {
  // catalog_avg5 3.3 ⇔ pool mean vote_average 6.6. A huge vote count makes
  // the Bayesian rating equal the movie's own average, so movie_avg5 = R / 2.
  const POOL_MEAN = 6.6;
  const known = (id: number, voteAverage: number) =>
    movie(id, { vote_average: voteAverage, vote_count: 1e12 });
  const godfatherLike = known(1, 8.7); // movie_avg5 4.35
  const obscure = known(2, 6.0); // movie_avg5 3.0
  const classic = known(3, 8.8); // movie_avg5 4.4
  // Offsets are measured against the mean reputation of the user's rated
  // movies. This 4★ (movie_avg5 1.45, offset −1.85) brings that mean to 0:
  // (1.05 − 0.3 + 1.1 − 1.85) / 4 = 0, so the spec values hold unchanged.
  const balancer = known(4, 2.9);
  const specRows = (classicUpdatedAt = NOW.toISOString()) => [
    rated(1, 5),
    rated(2, 5),
    rated(3, 3, classicUpdatedAt),
    rated(4, 4),
  ];
  const specFeatures = byId([godfatherLike, obscure, classic, balancer]);

  it("matches the spec values before decay and clamp", () => {
    expect(ratedBaseWeight(5, 4.0, 4.35 - 3.3)).toBeCloseTo(0.475); // ≈ +0.48
    expect(ratedBaseWeight(5, 4.0, 3.0 - 3.3)).toBeCloseTo(1.15);
    expect(ratedBaseWeight(3, 4.0, 4.4 - 3.3)).toBeCloseTo(-1.55);
  });

  it("derives movie_avg5 and the offset from the Bayesian rating", () => {
    expect(crowdScore5(godfatherLike, POOL_MEAN)).toBeCloseTo(4.35);
    expect(surpriseOffset(godfatherLike, POOL_MEAN)).toBeCloseTo(1.05);
    // Few votes: the reputation is mostly the pool mean, so the offset is small.
    expect(surpriseOffset(movie(9, { vote_average: 9, vote_count: 10 }), POOL_MEAN)).toBeCloseTo(
      ((10 / 1010) * 9 + (1000 / 1010) * 6.6) / 2 - 3.3,
    );
  });

  it("applies surprise, then decay, then the ±1.5 clamp in buildProfile", () => {
    // Ratings 5, 5, 3, 4 → mu = (17 + 7) / 6 = 4.0 exactly.
    const profile = buildProfile(specRows(), specFeatures, flatPercentile, NOW, POOL_MEAN);
    expect(profile.mu).toBe(4);
    expect(profile.weights.get(1)).toBeCloseTo(0.475);
    expect(profile.weights.get(2)).toBeCloseTo(1.15);
    expect(profile.weights.get(3)).toBe(-1.5); // −1.55 before the clamp
    expect(profile.weights.get(4)).toBeCloseTo(0.925); // 0 − 0.5 × (−1.85)

    // Decay comes before the clamp: half a year halves −1.55 to −0.775, not −0.75.
    const halfLifeAgo = new Date(NOW.getTime() - 180 * 86_400_000).toISOString();
    const decayed = buildProfile(specRows(halfLifeAgo), specFeatures, flatPercentile, NOW, POOL_MEAN);
    expect(decayed.weights.get(3)).toBeCloseTo(-0.775);
  });

  it("measures offsets against the user's own ratings, so loving only acclaimed films shrinks nothing", () => {
    // Three loved classics with the same strong reputation: relative offsets are all 0.
    const classics = [known(10, 8.7), known(11, 8.7), known(12, 8.7)];
    const profile = buildProfile(
      [rated(10, 5), rated(11, 5), rated(12, 5)],
      byId(classics),
      flatPercentile,
      NOW,
      POOL_MEAN,
    );
    // mu = (15 + 7) / 5 = 4.4; w = 5 − 4.4 with no surprise penalty.
    for (const id of [10, 11, 12]) expect(profile.weights.get(id)).toBeCloseTo(0.6);
  });

  it("records the absolute reputation on anchors", () => {
    const profile = buildProfile(specRows(), specFeatures, flatPercentile, NOW, POOL_MEAN);
    const byMovie = new Map(profile.anchors.map((a) => [a.movieId, a]));
    expect(byMovie.get(1)?.reputation).toBeCloseTo(1.05);
    expect(byMovie.get(2)?.reputation).toBeCloseTo(-0.3);
    expect(byMovie.get(4)?.reputation).toBeCloseTo(-1.85);
  });

  it("leaves watched, watchlist and not-interested weights unchanged", () => {
    const profile = buildProfile(
      [row(1, { watched: true }), row(2, { on_watchlist: true }), row(3, { not_interested: true })],
      byId([godfatherLike, obscure, classic]),
      flatPercentile,
      NOW,
      POOL_MEAN,
    );
    expect(profile.weights.get(1)).toBe(0.3);
    expect(profile.weights.get(2)).toBe(0.5);
    expect(profile.weights.get(3)).toBe(-1);
  });

  it("gives rated movies without a catalog row an offset of 0, and records crowd scores on anchors", () => {
    const profile = buildProfile([rated(1, 5), rated(404, 5)], byId([godfatherLike]), flatPercentile, NOW, POOL_MEAN);
    // mu = (10 + 7) / 4 = 4.25
    expect(profile.weights.get(404)).toBeCloseTo(0.75);
    expect(profile.anchors.find((a) => a.movieId === 404)?.crowdScore5).toBeNull();
    expect(profile.anchors.find((a) => a.movieId === 1)?.crowdScore5).toBeCloseTo(4.35);
  });
});
