import { describe, expect, it } from "vitest";
import { FOR_YOU_WEIGHTS } from "@/lib/recommender/constants";
import type { RecommendContext } from "@/lib/recommender/context";
import { explain } from "@/lib/recommender/explain";
import { buildProfile } from "@/lib/recommender/profile";
import { effectiveWeights, type ScoredCandidate } from "@/lib/recommender/score";
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

const features = byId([INTERSTELLAR, THE_MARTIAN, TRANSFORMERS]);
const profile = buildProfile(
  [rated(INTERSTELLAR.id, 5), rated(THE_MARTIAN.id, 4), rated(TRANSFORMERS.id, 1)],
  features,
  flatPercentile,
  NOW,
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
    expect(explain(scored(drama, {}), profile, features, null)).toBe(
      "Because you loved Interstellar: Drama",
    );
    const western = movie(2, { genres: ["Western"] });
    expect(explain(scored(western, {}), profile, features, null)).toBe("Popular and highly rated");
  });
});
