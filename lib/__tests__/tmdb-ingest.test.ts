import { afterEach, describe, expect, it, vi } from "vitest";
import { tmdb, toRow, type TmdbMovieDetails } from "@/lib/tmdb-ingest";

const SYNCED_AT = "2026-10-26T00:00:00.000Z";

const fullDetails: TmdbMovieDetails = {
  id: 1063879,
  title: "Fallen Leaves",
  overview: "Two lonely people meet by chance in the Helsinki night.",
  release_date: "2023-09-14",
  runtime: 81,
  vote_average: 7.1,
  vote_count: 700,
  popularity: 12.5,
  original_language: "fi",
  poster_path: "/poster.jpg",
  backdrop_path: "/backdrop.jpg",
  genres: [{ name: "Comedy" }, { name: "Drama" }, { name: "Romance" }],
  credits: {
    // Deliberately out of billing order, with more than five members.
    cast: [
      { name: "Sixth", order: 5 },
      { name: "Jussi Vatanen", order: 1 },
      { name: "Third", order: 2 },
      { name: "Alma Pöysti", order: 0 },
      { name: "Fifth", order: 4 },
      { name: "Fourth", order: 3 },
    ],
    crew: [
      { name: "Timo Salminen", job: "Director of Photography" },
      { name: "Aki Kaurismäki", job: "Director" },
      { name: "Someone Else", job: "Director" },
    ],
  },
  keywords: { keywords: [{ name: "helsinki" }, { name: "loneliness" }] },
};

describe("toRow", () => {
  it("maps every field to the public.movies shape", () => {
    expect(toRow(fullDetails, SYNCED_AT)).toEqual({
      id: 1063879,
      title: "Fallen Leaves",
      overview: "Two lonely people meet by chance in the Helsinki night.",
      release_date: "2023-09-14",
      runtime_min: 81,
      vote_average: 7.1,
      vote_count: 700,
      popularity: 12.5,
      original_language: "fi",
      poster_path: "/poster.jpg",
      backdrop_path: "/backdrop.jpg",
      genres: ["Comedy", "Drama", "Romance"],
      keywords: ["helsinki", "loneliness"],
      director: "Aki Kaurismäki",
      top_cast: ["Alma Pöysti", "Jussi Vatanen", "Third", "Fourth", "Fifth"],
      tmdb_synced_at: SYNCED_AT,
    });
  });

  it("orders top_cast by billing order and keeps five", () => {
    const row = toRow(fullDetails, SYNCED_AT);
    expect(row.top_cast).toHaveLength(5);
    expect(row.top_cast[0]).toBe("Alma Pöysti");
    expect(row.top_cast).not.toContain("Sixth");
  });

  it("takes the first crew member whose job is exactly Director", () => {
    expect(toRow(fullDetails, SYNCED_AT).director).toBe("Aki Kaurismäki");
  });

  it("does not mutate the input cast array", () => {
    const before = fullDetails.credits?.cast.map((member) => member.name);
    toRow(fullDetails, SYNCED_AT);
    expect(fullDetails.credits?.cast.map((member) => member.name)).toEqual(before);
  });

  it("turns missing or empty fields into null and missing lists into []", () => {
    const sparse: TmdbMovieDetails = {
      id: 7,
      title: "Untitled",
      overview: "",
      release_date: "",
      runtime: 0,
      vote_average: null,
      vote_count: null,
      popularity: null,
      original_language: null,
      poster_path: null,
      backdrop_path: null,
      genres: [],
    };
    expect(toRow(sparse, SYNCED_AT)).toEqual({
      id: 7,
      title: "Untitled",
      overview: null,
      release_date: null,
      runtime_min: null,
      vote_average: null,
      vote_count: null,
      popularity: null,
      original_language: null,
      poster_path: null,
      backdrop_path: null,
      genres: [],
      keywords: [],
      director: null,
      top_cast: [],
      tmdb_synced_at: SYNCED_AT,
    });
  });

  it("gives a null director when the crew has no Director", () => {
    const row = toRow(
      { ...fullDetails, credits: { cast: [], crew: [{ name: "Writer", job: "Screenplay" }] } },
      SYNCED_AT,
    );
    expect(row.director).toBeNull();
    expect(row.top_cast).toEqual([]);
  });
});

describe("tmdb with an AbortSignal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("passes the signal to fetch and does not retry once it is aborted", async () => {
    vi.stubEnv("TMDB_READ_TOKEN", "test-token");
    const fetchMock = vi.fn((_url: URL, init?: RequestInit) => Promise.reject(init?.signal?.reason));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    controller.abort(new Error("deadline"));

    await expect(tmdb("/search/movie", { query: "x" }, controller.signal)).rejects.toThrow("deadline");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("fails with a clear error when TMDB_READ_TOKEN is missing", async () => {
    vi.stubEnv("TMDB_READ_TOKEN", "");
    await expect(tmdb("/search/movie")).rejects.toThrow("TMDB_READ_TOKEN is not set");
  });
});
