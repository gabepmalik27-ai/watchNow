import { describe, expect, it } from "vitest";
import { FOR_YOU_WEIGHTS } from "@/lib/recommender/constants";
import type { RecommendContext } from "@/lib/recommender/context";
import { explain } from "@/lib/recommender/explain";
import { buildProfile } from "@/lib/recommender/profile";
import { effectiveWeights, type ScoredCandidate } from "@/lib/recommender/score";
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
} from "./fixtures";

const features = byId([INTERSTELLAR, THE_MARTIAN, TRANSFORMERS]);
const profile = buildProfile(
  [rated(INTERSTELLAR.id, 5), rated(THE_MARTIAN.id, 4), rated(TRANSFORMERS.id, 1)],
  features,
  flatPercentile,
  NOW,
  FIXTURE_POOL_MEAN,
);

function scored(
  candidate: ReturnType<typeof movie>,
  contributions: Partial<ScoredCandidate["breakdown"]["contributions"]>,
  coldStart = false,
): ScoredCandidate {
  const zero = { context: 0, keyword: 0, genre: 0, people: 0, quality: 0, rarity: 0 };
  return {
    movie: candidate,
    breakdown: {
      raw: { keyword: 0, genre: 0, people: 0 },
      features: zero,
      weights: effectiveWeights(FOR_YOU_WEIGHTS, { coldStart, hasContext: false }),
      contributions: { ...zero, ...contributions },
      score: 0,
      coldStart,
      popularityPercentile: 0.5,
      rarityTarget: 0.5,
    },
  };
}

const gravity = movie(49047, {
  title: "Gravity",
  keywords: ["space", "astronaut", "space travel", "survival"],
  genres: ["Science Fiction", "Thriller"],
});

describe("explain", () => {
  it("names the anchor with the most shared liked keywords and its top two", () => {
    const reason = explain(scored(gravity, { keyword: 0.3 }), profile, features, null);
    // Interstellar (w 1.6) and The Martian (w 0.6) both share space/astronaut/space travel;
    // The Martian also shares "survival", so its overlap is larger.
    expect(reason).toMatch(/^Because you loved The Martian: /);
    expect(reason.split(": ")[1].split(", ")).toHaveLength(2);
  });

  it("uses the context label when context outweighs taste", () => {
    const ctx: RecommendContext = { mood: "Exciting", experience: null, time: "<90", discovery: 50 };
    expect(explain(scored(gravity, { context: 0.4, keyword: 0.1 }), profile, features, ctx)).toBe(
      "Under 90 min · Exciting",
    );
    expect(explain(scored(gravity, { context: 0.1, keyword: 0.3 }), profile, features, ctx)).toMatch(
      /^Because you loved/,
    );
  });

  it("says 'Popular and highly rated' during cold start", () => {
    expect(explain(scored(gravity, {}, true), profile, features, null)).toBe("Popular and highly rated");
  });

  it("falls back to a liked genre, then the cold-start text", () => {
    const drama = movie(1, { genres: ["Drama"], keywords: ["family"] });
    // The fixture Interstellar's 5★ is 1.5 stars above its crowd score
    // (3.5), but its reputation is exactly average, not below it, so the
    // crowd-gap wording doesn't apply.
    expect(explain(scored(drama, {}), profile, features, null)).toBe(
      "Because you loved Interstellar: Drama",
    );
    const western = movie(2, { genres: ["Western"] });
    expect(explain(scored(western, {}), profile, features, null)).toBe("Popular and highly rated");
  });
});

describe("explain: crowd gap", () => {
  // Pool mean 7.0 → catalog_avg5 3.5. Huge vote counts make movie_avg5 = R / 2.
  const cult = movie(500, {
    title: "Hackers",
    vote_average: 6.0, // movie_avg5 3.0
    vote_count: 1e12,
    keywords: ["hacker", "computer"],
    genres: ["Crime"],
  });
  const classic = movie(501, {
    title: "Casablanca",
    vote_average: 8.2, // movie_avg5 4.1
    vote_count: 1e12,
    keywords: ["world war ii", "nightclub"],
    genres: ["Romance"],
  });
  const crowdFeatures = byId([cult, classic, movie(502), movie(503)]);
  // mu = (5 + 5 + 3 + 3 + 7) / 6 = 3.833
  const crowdProfile = buildProfile(
    [rated(500, 5), rated(501, 5), rated(502, 3), rated(503, 3)],
    crowdFeatures,
    flatPercentile,
    NOW,
    FIXTURE_POOL_MEAN,
  );

  it("says 'higher than most viewers' when the anchor was rated ≥ 1 star above its crowd score", () => {
    const candidate = movie(600, { keywords: ["hacker"], genres: ["Crime"] });
    // 5 − 3.0 = 2 stars above the crowd.
    expect(explain(scored(candidate, { keyword: 0.3 }), crowdProfile, crowdFeatures, null)).toBe(
      "You rated Hackers higher than most viewers",
    );
  });

  it("keeps 'Because you loved' for a well-regarded film even when rated ≥ 1 star above the crowd", () => {
    const wellRegarded = movie(510, {
      title: "Toy Story",
      vote_average: 8.0, // movie_avg5 4.0: above the 3.5 catalog average
      vote_count: 1e12,
      keywords: ["toy"],
      genres: ["Animation"],
    });
    const f = byId([wellRegarded, movie(511), movie(512)]);
    const p = buildProfile(
      [rated(510, 5), rated(511, 3), rated(512, 3)],
      f,
      flatPercentile,
      NOW,
      FIXTURE_POOL_MEAN,
    );
    // Gap 5 − 4.0 = 1.0, but the reputation is above average.
    expect(explain(scored(movie(610, { keywords: ["toy"] }), { keyword: 0.3 }), p, f, null)).toBe(
      "Because you loved Toy Story: toy",
    );
  });

  it("keeps 'Because you loved' when the anchor's rating is close to its reputation", () => {
    const candidate = movie(601, { keywords: ["nightclub"], genres: ["Romance"] });
    // 5 − 4.1 = 0.9 stars: below the 1-star gap.
    expect(explain(scored(candidate, { keyword: 0.3 }), crowdProfile, crowdFeatures, null)).toBe(
      "Because you loved Casablanca: nightclub, Romance",
    );
  });
});
