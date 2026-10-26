import { describe, expect, it } from "vitest";
import { formatMatchHint } from "@/lib/format";

describe("formatMatchHint", () => {
  it("names the director", () => {
    expect(formatMatchHint({ match_kind: "director", match_person: "Christopher Nolan" })).toBe(
      "Directed by Christopher Nolan",
    );
  });

  it("names the cast member", () => {
    expect(formatMatchHint({ match_kind: "cast", match_person: "Tom Hanks" })).toBe("Stars Tom Hanks");
  });

  it("gives no hint for title, fuzzy and genre matches", () => {
    for (const match_kind of ["title", "fuzzy", "genre"] as const) {
      expect(formatMatchHint({ match_kind, match_person: null })).toBeNull();
    }
  });

  it("gives no hint when a person kind arrives without a name", () => {
    expect(formatMatchHint({ match_kind: "cast", match_person: null })).toBeNull();
  });
});
