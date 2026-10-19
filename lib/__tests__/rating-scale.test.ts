import { describe, expect, it } from "vitest";
import {
  RATING_LABELS,
  RATING_VALUES,
  formatAudienceRating,
  formatUserRating,
  isValidRating,
  ratingLabel,
  ratingTendency,
} from "../rating-scale";

describe("rating scale", () => {
  it("has a label for every value 1–10", () => {
    expect(RATING_VALUES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const n of RATING_VALUES) expect(RATING_LABELS[n]).toBeTruthy();
    expect(ratingLabel(7)).toBe("Good");
    expect(ratingLabel(10)).toBe("All-time favorite");
    expect(ratingLabel(11)).toBe("");
  });

  it("accepts only integers 1–10", () => {
    expect([1, 6, 10].every(isValidRating)).toBe(true);
    for (const bad of [0, 11, 0.5, 4.5, -1, NaN]) expect(isValidRating(bad)).toBe(false);
  });

  it("formats user and audience ratings without any /2 conversion", () => {
    expect(formatUserRating(7)).toBe("7/10");
    expect(formatAudienceRating(7.84)).toBe("7.8/10");
    expect(formatAudienceRating(null)).toBe("—");
  });

  it("describes an average against the anchor", () => {
    expect(ratingTendency(7)).toBe("You rate generously");
    expect(ratingTendency(8.4)).toBe("You rate generously");
    expect(ratingTendency(5)).toBe("You rate tough");
    expect(ratingTendency(3.2)).toBe("You rate tough");
    expect(ratingTendency(6)).toBe("Close to average");
    expect(ratingTendency(6.9)).toBe("Close to average");
  });
});
