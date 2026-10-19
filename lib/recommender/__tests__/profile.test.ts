import { describe, expect, it } from "vitest";
import {
  baseWeight,
  buildProfile,
  clampWeight,
  genreTarget,
  ratedBaseWeight,
  recencyDecay,
  shrunkMean,
} from "@/lib/recommender/profile";
import { crowdScore, surpriseOffset } from "@/lib/recommender/features";
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
    expect(shrunkMean([])).toBe(7);
  });

  it("adds two pseudo-ratings of 7", () => {
    expect(shrunkMean([10, 10])).toBeCloseTo(8.5); // (20 + 14) / 4
    expect(shrunkMean([10, 8, 2])).toBeCloseTo(6.8); // (20 + 14) / 5
  });
});

describe("baseWeight", () => {
  const mu = 6.8;

  it("rated → rating − mu, regardless of other flags", () => {
    expect(baseWeight(row(1, { rating: 10, on_watchlist: true, not_interested: true }), mu)).toBeCloseTo(3.2);
    expect(baseWeight(row(1, { rating: 2 }), mu)).toBeCloseTo(-4.8);
  });

  it("applies the fixed precedence for unrated rows", () => {
    expect(baseWeight(row(1, { not_interested: true, watched: true }), mu)).toBe(-2);
    expect(baseWeight(row(1, { watched: true, on_watchlist: true }), mu)).toBe(0.6);
    expect(baseWeight(row(1, { on_watchlist: true }), mu)).toBe(1);
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
    const profile = buildProfile([rated(1, 10, old)], byId([movie(1)]), flatPercentile, NOW, FIXTURE_POOL_MEAN);
    // mu = (10 + 14) / 3 = 8; w = (10 − 8) · 0.25
    expect(profile.weights.get(1)).toBeCloseTo(0.5);
  });
});

describe("buildProfile", () => {
  const features = byId([INTERSTELLAR, THE_MARTIAN, TRANSFORMERS]);
  const rows = [rated(INTERSTELLAR.id, 10), rated(THE_MARTIAN.id, 8), rated(TRANSFORMERS.id, 2)];

  it("Interstellar 10 / Martian 8 / Transformers 2: weights clamp to ±3, sci-fi from the positive weights only, robot negative", () => {
    const profile = buildProfile(rows, features, flatPercentile, NOW, FIXTURE_POOL_MEAN);
    expect(profile.mu).toBeCloseTo(6.8);
    // Unclamped: +3.2, +1.2, −4.8. WEIGHT_CLIP limits both extremes to 3.
    expect(profile.weights.get(INTERSTELLAR.id)).toBeCloseTo(3);
    expect(profile.weights.get(THE_MARTIAN.id)).toBeCloseTo(1.2);
    expect(profile.weights.get(TRANSFORMERS.id)).toBeCloseTo(-3);

    // GENRE_NEGATIVE_LEARNING is off: Transformers adds nothing to genre
    // affinity, so Science Fiction is (3 + 1.2) / (2 + 2).
    expect(profile.affinity.genre.get("Science Fiction")).toBeCloseTo(1.05);
    // Action appears only on Transformers, so it has no affinity at all.
    expect(profile.affinity.genre.has("Action")).toBe(false);

    expect(profile.affinity.keyword.get("space")).toBeCloseTo(1.05); // 4.2 / (2 + 2)
    expect(profile.affinity.keyword.get("astronaut")).toBeGreaterThan(0);
    // Keywords still learn from the dislike.
    expect(profile.affinity.keyword.get("robot")).toBeCloseTo(-1); // −3 / (1 + 2)
    expect(profile.affinity.director.get("Michael Bay")).toBeCloseTo(-1);
  });

  it("8 sci-fi films at 10/10 plus Transformers at 2/10: the 2/10 doesn't touch Science Fiction affinity", () => {
    const loved = Array.from({ length: 8 }, (_, i) =>
      movie(100 + i, { genres: ["Science Fiction", i % 2 ? "Drama" : "Adventure"] }),
    );
    const profile = buildProfile(
      [...loved.map((m) => rated(m.id, 10)), rated(TRANSFORMERS.id, 2)],
      byId([...loved, TRANSFORMERS]),
      flatPercentile,
      NOW,
      FIXTURE_POOL_MEAN,
    );
    // mu = (80 + 2 + 14) / 11 = 8.7273; each 10/10 → +1.2727; Transformers 2 − 8.7273 = −6.73 → −3.
    expect(profile.weights.get(TRANSFORMERS.id)).toBe(-3);
    const scifi = profile.affinity.genre.get("Science Fiction") ?? NaN;
    // Only the eight loves count toward the genre: 8 · 1.2727 / (8 + 2).
    expect(scifi).toBeCloseTo((8 * (10 - 96 / 11)) / (8 + 2)); // 1.0182
    expect(scifi).toBeGreaterThan(1);
  });

  it("clamps every weight to ±WEIGHT_CLIP", () => {
    expect(clampWeight(8)).toBe(3);
    expect(clampWeight(-8)).toBe(-3);
    expect(clampWeight(0.6)).toBe(0.6);
  });

  it("gives cast half weight and counts only the top 3 billed", () => {
    const profile = buildProfile(rows, features, flatPercentile, NOW, FIXTURE_POOL_MEAN);
    // Jessica Chastain: 4th in Interstellar (ignored), 2nd in The Martian.
    expect(profile.affinity.cast.get("Jessica Chastain")).toBeCloseTo((0.5 * 1.2) / (1 + 2));
    expect(profile.affinity.cast.get("Matthew McConaughey")).toBeCloseTo((0.5 * 3) / (1 + 2));
    expect(profile.affinity.director.get("Christopher Nolan")).toBeCloseTo(3 / 3);
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
  // Pool mean vote_average 6.6 is catalog_avg. A huge vote count makes the
  // Bayesian rating equal the movie's own average, so movie_avg = R.
  const POOL_MEAN = 6.6;
  const known = (id: number, voteAverage: number) =>
    movie(id, { vote_average: voteAverage, vote_count: 1e12 });
  const godfatherLike = known(1, 8.7); // movie_avg 8.7
  const obscure = known(2, 6.0); // movie_avg 6.0
  const classic = known(3, 8.8); // movie_avg 8.8
  // Offsets are measured against the mean reputation of the user's rated
  // movies. This 8/10 (movie_avg 2.9, offset −3.7) brings that mean to 0:
  // (2.1 − 0.6 + 2.2 − 3.7) / 4 = 0, so the offsets below are the raw offsets.
  const balancer = known(4, 2.9);
  const specRows = (classicUpdatedAt = NOW.toISOString()) => [
    rated(1, 10),
    rated(2, 10),
    rated(3, 6, classicUpdatedAt),
    rated(4, 8),
  ];
  const specFeatures = byId([godfatherLike, obscure, classic, balancer]);

  it("matches the spec values before decay and clamp", () => {
    expect(ratedBaseWeight(10, 8.0, 8.7 - 6.6)).toBeCloseTo(0.95); // ≈ +0.95
    expect(ratedBaseWeight(10, 8.0, 6.0 - 6.6)).toBeCloseTo(2.3);
    expect(ratedBaseWeight(6, 8.0, 8.8 - 6.6)).toBeCloseTo(-3.1);
  });

  it("derives movie_avg and the offset from the Bayesian rating", () => {
    expect(crowdScore(godfatherLike, POOL_MEAN)).toBeCloseTo(8.7);
    expect(surpriseOffset(godfatherLike, POOL_MEAN)).toBeCloseTo(2.1);
    // Few votes: the reputation is mostly the pool mean, so the offset is small.
    expect(surpriseOffset(movie(9, { vote_average: 9, vote_count: 10 }), POOL_MEAN)).toBeCloseTo(
      (10 / 1010) * 9 + (1000 / 1010) * 6.6 - 6.6,
    );
  });

  it("applies surprise, then decay, then the ±3 clamp in buildProfile", () => {
    // Ratings 10, 10, 6, 8 → mu = (34 + 14) / 6 = 8 exactly.
    const profile = buildProfile(specRows(), specFeatures, flatPercentile, NOW, POOL_MEAN);
    expect(profile.mu).toBe(8);
    expect(profile.weights.get(1)).toBeCloseTo(0.95);
    expect(profile.weights.get(2)).toBeCloseTo(2.3);
    expect(profile.weights.get(3)).toBe(-3); // −3.1 before the clamp
    expect(profile.weights.get(4)).toBeCloseTo(1.85); // 0 − 0.5 × (−3.7)

    // Decay comes before the clamp: half a year halves −3.1 to −1.55, not −1.5.
    const halfLifeAgo = new Date(NOW.getTime() - 180 * 86_400_000).toISOString();
    const decayed = buildProfile(specRows(halfLifeAgo), specFeatures, flatPercentile, NOW, POOL_MEAN);
    expect(decayed.weights.get(3)).toBeCloseTo(-1.55);
  });

  it("measures offsets against the user's own ratings, so loving only acclaimed films shrinks nothing", () => {
    // Three loved classics with the same strong reputation: relative offsets are all 0.
    const classics = [known(10, 8.7), known(11, 8.7), known(12, 8.7)];
    const profile = buildProfile(
      [rated(10, 10), rated(11, 10), rated(12, 10)],
      byId(classics),
      flatPercentile,
      NOW,
      POOL_MEAN,
    );
    // mu = (30 + 14) / 5 = 8.8; w = 10 − 8.8 with no surprise penalty.
    for (const id of [10, 11, 12]) expect(profile.weights.get(id)).toBeCloseTo(1.2);
  });

  it("records the absolute reputation on anchors", () => {
    const profile = buildProfile(specRows(), specFeatures, flatPercentile, NOW, POOL_MEAN);
    const byMovie = new Map(profile.anchors.map((a) => [a.movieId, a]));
    expect(byMovie.get(1)?.reputation).toBeCloseTo(2.1);
    expect(byMovie.get(2)?.reputation).toBeCloseTo(-0.6);
    expect(byMovie.get(4)?.reputation).toBeCloseTo(-3.7);
  });

  it("leaves watched, watchlist and not-interested weights unchanged", () => {
    const profile = buildProfile(
      [row(1, { watched: true }), row(2, { on_watchlist: true }), row(3, { not_interested: true })],
      byId([godfatherLike, obscure, classic]),
      flatPercentile,
      NOW,
      POOL_MEAN,
    );
    expect(profile.weights.get(1)).toBe(0.6);
    expect(profile.weights.get(2)).toBe(1);
    expect(profile.weights.get(3)).toBe(-2);
  });

  it("gives rated movies without a catalog row an offset of 0, and records crowd scores on anchors", () => {
    const profile = buildProfile([rated(1, 10), rated(404, 10)], byId([godfatherLike]), flatPercentile, NOW, POOL_MEAN);
    // mu = (20 + 14) / 4 = 8.5
    expect(profile.weights.get(404)).toBeCloseTo(1.5);
    expect(profile.anchors.find((a) => a.movieId === 404)?.crowdScore).toBeNull();
    expect(profile.anchors.find((a) => a.movieId === 1)?.crowdScore).toBeCloseTo(8.7);
  });
});

describe("genre learning from volume, style learning from ratings (T28)", () => {
  // Four comedies loved, four dramas watched, then three comedies panned at 2/10.
  const loved = Array.from({ length: 4 }, (_, i) =>
    movie(200 + i, { genres: ["Comedy"], keywords: ["slapstick"], director: "Loved Director" }),
  );
  const dramas = Array.from({ length: 4 }, (_, i) => movie(300 + i, { genres: ["Drama"] }));
  const panned = Array.from({ length: 3 }, (_, i) =>
    movie(400 + i, { genres: ["Comedy"], keywords: ["gross-out"], director: "Panned Director" }),
  );
  const features = byId([...loved, ...dramas, ...panned]);
  const baseRows = [...loved.map((m) => rated(m.id, 10)), ...dramas.map((m) => row(m.id, { watched: true }))];
  const withPans = [...baseRows, ...panned.map((m) => rated(m.id, 2))];
  const profileOf = (rows: typeof baseRows) =>
    buildProfile(rows, features, flatPercentile, NOW, FIXTURE_POOL_MEAN);

  it("(a) three 2/10 comedies don't lower Comedy genre affinity", () => {
    const before = profileOf(baseRows).affinity.genre.get("Comedy") ?? 0;
    const after = profileOf(withPans).affinity.genre.get("Comedy") ?? 0;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("(b) they do lower their own keywords and director", () => {
    const profile = profileOf(withPans);
    expect(profile.affinity.keyword.get("gross-out")).toBeLessThan(0);
    expect(profile.affinity.director.get("Panned Director")).toBeLessThan(0);
    expect(profile.affinity.keyword.get("slapstick")).toBeGreaterThan(0);
  });

  it("(c) they don't lower comedy's calibration share", () => {
    const poolGenres = ["Comedy", "Drama"];
    const before = genreTarget(baseRows, features, NOW, poolGenres).get("Comedy") ?? 0;
    const after = genreTarget(withPans, features, NOW, poolGenres).get("Comedy") ?? 0;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
