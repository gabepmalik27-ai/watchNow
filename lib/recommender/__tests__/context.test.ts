import { describe, expect, it } from "vitest";
import {
  contextLabel,
  contextMatch,
  hasContextSelection,
  passesTimeFilter,
  rarityTargetFromDiscovery,
  type RecommendContext,
} from "@/lib/recommender/context";
import { movie } from "./fixtures";

const none: RecommendContext = { mood: null, experience: null, time: null, discovery: 50 };

describe("passesTimeFilter (hard filter)", () => {
  it("<90 keeps ≤ 90 only", () => {
    expect(passesTimeFilter(90, "<90")).toBe(true);
    expect(passesTimeFilter(91, "<90")).toBe(false);
  });

  it("90–120 is inclusive on both ends", () => {
    expect(passesTimeFilter(89, "90–120")).toBe(false);
    expect(passesTimeFilter(90, "90–120")).toBe(true);
    expect(passesTimeFilter(120, "90–120")).toBe(true);
    expect(passesTimeFilter(121, "90–120")).toBe(false);
  });

  it("2+ hours keeps ≥ 120", () => {
    expect(passesTimeFilter(119, "2+ hours")).toBe(false);
    expect(passesTimeFilter(120, "2+ hours")).toBe(true);
  });

  it("excludes null runtimes only when a time is chosen", () => {
    expect(passesTimeFilter(null, "<90")).toBe(false);
    expect(passesTimeFilter(null, null)).toBe(true);
    expect(passesTimeFilter(300, null)).toBe(true);
  });
});

describe("contextMatch", () => {
  it("is 0 with nothing selected", () => {
    expect(hasContextSelection(none)).toBe(false);
    expect(contextMatch(movie(1, { genres: ["Comedy"] }), none)).toBe(0);
  });

  it("caps each dimension at 2 hits", () => {
    const funny: RecommendContext = { ...none, mood: "Funny" };
    expect(contextMatch(movie(1, { genres: ["Comedy"] }), funny)).toBe(0.5);
    expect(contextMatch(movie(1, { genres: ["Comedy", "Family"] }), funny)).toBe(1);
    expect(contextMatch(movie(1, { genres: ["Comedy", "Family", "Animation"] }), funny)).toBe(1);
    expect(contextMatch(movie(1, { genres: ["Comedy"], keywords: ["Parody"] }), funny)).toBe(1);
  });

  it("averages mood and experience", () => {
    const ctx: RecommendContext = { ...none, mood: "Funny", experience: "Engaging" };
    // Funny: Comedy → 0.5; Engaging: Drama + Mystery → 1
    expect(contextMatch(movie(1, { genres: ["Comedy", "Drama", "Mystery"] }), ctx)).toBe(0.75);
  });

  it("subtracts 0.5 per penalized genre, clamped at 0", () => {
    const relaxing: RecommendContext = { ...none, mood: "Relaxing" };
    expect(contextMatch(movie(1, { genres: ["Comedy", "Family", "Thriller"] }), relaxing)).toBe(0.5);
    expect(contextMatch(movie(1, { genres: ["Comedy", "Horror", "War"] }), relaxing)).toBe(0);
  });
});

describe("rarityTargetFromDiscovery", () => {
  it("Safe Pick targets popular, Surprise Me targets niche", () => {
    expect(rarityTargetFromDiscovery(0)).toBe(1);
    expect(rarityTargetFromDiscovery(100)).toBe(0);
    expect(rarityTargetFromDiscovery(50)).toBe(0.5);
    expect(rarityTargetFromDiscovery(150)).toBe(0);
  });
});

describe("contextLabel", () => {
  it("joins the chosen parts", () => {
    expect(contextLabel({ ...none, time: "<90", mood: "Funny" })).toBe("Under 90 min · Funny");
    expect(contextLabel({ ...none, experience: "Intense" })).toBe("Intense");
  });
});
