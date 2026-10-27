import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tmdb: vi.fn(),
  fetchMovieRow: vi.fn(),
  createClient: vi.fn(),
}));

// server-only throws outside a React Server Components build.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/tmdb-ingest", () => ({ tmdb: mocks.tmdb, fetchMovieRow: mocks.fetchMovieRow }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

type CatalogAdmin = typeof import("@/lib/catalog-admin");

/** A supabase-js query builder stand-in: chainable, and awaitable for `result`. */
function builder<T>(result: T) {
  const query = {
    abortSignal: () => query,
    then: (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

const movieRow = (id: number) => ({ id, title: `Movie ${id}` });
const hit = (id: number, vote_count: number, extra: { adult?: boolean } = {}) => ({
  id,
  vote_count,
  ...extra,
});

describe("selectImportCandidates", () => {
  let select: CatalogAdmin["selectImportCandidates"];

  beforeEach(async () => {
    vi.resetModules();
    ({ selectImportCandidates: select } = await import("@/lib/catalog-admin"));
  });

  it("keeps films at the 20-vote floor and drops those below it", () => {
    expect(select([hit(1, 19), hit(2, 20), hit(3, 21)], [])).toEqual([3, 2]);
  });

  it("drops results with no vote count", () => {
    expect(select([{ id: 1 }, { id: 2, vote_count: null }, hit(3, 50)], [])).toEqual([3]);
  });

  it("excludes adult films but not ones with adult false or missing", () => {
    expect(select([hit(1, 90, { adult: true }), hit(2, 80, { adult: false }), hit(3, 70)], [])).toEqual([2, 3]);
  });

  it("skips ids already in the catalog, from an array or a Set", () => {
    const results = [hit(1, 90), hit(2, 80), hit(3, 70)];
    expect(select(results, [1, 3])).toEqual([2]);
    expect(select(results, new Set([2]))).toEqual([1, 3]);
  });

  it("takes at most 5, the most-voted", () => {
    const results = [30, 90, 50, 70, 60, 40, 80].map((votes, index) => hit(index + 1, votes));
    expect(select(results, [])).toEqual([2, 7, 4, 5, 3]); // 90, 80, 70, 60, 50 votes
  });

  it("breaks vote ties by ascending id, whatever the input order", () => {
    expect(select([hit(9, 50), hit(3, 50), hit(5, 50), hit(1, 60)], [])).toEqual([1, 3, 5, 9]);
    expect(select([hit(5, 50), hit(9, 50), hit(1, 60), hit(3, 50)], [])).toEqual([1, 3, 5, 9]);
  });

  it("lists an id once even if TMDB returns it twice", () => {
    expect(select([hit(4, 50), hit(4, 50), hit(2, 40)], [])).toEqual([4, 2]);
  });

  it("returns nothing for no results", () => {
    expect(select([], [1, 2])).toEqual([]);
  });
});

describe("shouldImport", () => {
  let shouldImport: CatalogAdmin["shouldImport"];

  beforeEach(async () => {
    vi.resetModules();
    ({ shouldImport } = await import("@/lib/catalog-admin"));
  });

  const title = { match_kind: "title" } as const;
  const fuzzy = { match_kind: "fuzzy" } as const;

  it("is false for queries shorter than 3 characters, even with no results", () => {
    expect(shouldImport("ab", [])).toBe(false);
    expect(shouldImport("  ab  ", [])).toBe(false);
    expect(shouldImport("", [])).toBe(false);
  });

  it("is true from exactly 3 characters", () => {
    expect(shouldImport("abc", [])).toBe(true);
    expect(shouldImport("  abc ", [])).toBe(true);
  });

  it("is false when any result is a real match", () => {
    expect(shouldImport("godfather", [title])).toBe(false);
    expect(shouldImport("godfather", [fuzzy, title])).toBe(false);
    expect(shouldImport("nolan", [{ match_kind: "director" }, { match_kind: "cast" }])).toBe(false);
  });

  it("is true when nothing came back", () => {
    expect(shouldImport("fallen leaves", [])).toBe(true);
  });

  it("is true when every result is a fuzzy guess", () => {
    expect(shouldImport("interstelar", [fuzzy])).toBe(true);
    expect(shouldImport("interstelar", [fuzzy, fuzzy, fuzzy])).toBe(true);
  });
});

describe("importMoviesForQuery", () => {
  let importMoviesForQuery: CatalogAdmin["importMoviesForQuery"];
  let upsert: ReturnType<typeof vi.fn>;
  let existingRows: { id: number }[];

  beforeEach(async () => {
    vi.resetModules();
    mocks.tmdb.mockReset();
    mocks.fetchMovieRow.mockReset();
    mocks.createClient.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    existingRows = [];
    upsert = vi.fn(() => builder({ error: null }));
    mocks.createClient.mockReturnValue({
      from: () => ({
        select: () => ({ in: () => builder({ data: existingRows, error: null }) }),
        upsert,
      }),
    });
    mocks.fetchMovieRow.mockImplementation(async (id: number) => movieRow(id));

    ({ importMoviesForQuery } = await import("@/lib/catalog-admin"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 0 without throwing when TMDB fails", async () => {
    mocks.tmdb.mockRejectedValue(new Error("HTTP 500"));
    await expect(importMoviesForQuery("fallen leaves")).resolves.toBe(0);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 0 without throwing when the service env vars are missing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    mocks.tmdb.mockResolvedValue({ results: [hit(1, 50)] });
    await expect(importMoviesForQuery("fallen leaves")).resolves.toBe(0);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 0 without throwing when the upsert is rejected", async () => {
    mocks.tmdb.mockResolvedValue({ results: [hit(1, 50)] });
    upsert.mockReturnValue(builder({ error: { message: "permission denied" } }));
    await expect(importMoviesForQuery("fallen leaves")).resolves.toBe(0);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("imports the qualifying films that aren't in the catalog yet", async () => {
    mocks.tmdb.mockResolvedValue({
      results: [hit(1, 50), hit(2, 5), hit(3, 30), hit(4, 90, { adult: true })],
    });
    existingRows = [{ id: 3 }];

    await expect(importMoviesForQuery("  Fallen Leaves ")).resolves.toBe(1);

    expect(mocks.tmdb).toHaveBeenCalledWith(
      "/search/movie",
      { query: "Fallen Leaves", include_adult: "false", page: "1" },
      expect.any(AbortSignal),
    );
    expect(mocks.fetchMovieRow).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMovieRow).toHaveBeenCalledWith(1, expect.any(String), expect.any(AbortSignal));
    expect(upsert).toHaveBeenCalledWith([movieRow(1)], { onConflict: "id" });
  });

  it("upserts the films that fetched even if another one fails", async () => {
    mocks.tmdb.mockResolvedValue({ results: [hit(1, 90), hit(2, 80), hit(3, 70)] });
    mocks.fetchMovieRow.mockImplementation(async (id: number) => {
      if (id === 2) throw new Error("HTTP 404");
      return movieRow(id);
    });
    await expect(importMoviesForQuery("trilogy")).resolves.toBe(2);
    expect(upsert).toHaveBeenCalledWith([movieRow(1), movieRow(3)], { onConflict: "id" });
  });

  it("returns 0 and writes nothing when TMDB has no results", async () => {
    mocks.tmdb.mockResolvedValue({ results: [] });
    await expect(importMoviesForQuery("qxzvkw")).resolves.toBe(0);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  describe("miss cache", () => {
    it("makes no network call for a query that just came up empty", async () => {
      mocks.tmdb.mockResolvedValue({ results: [] });
      await importMoviesForQuery("qxzvkw");
      await importMoviesForQuery("qxzvkw");
      await importMoviesForQuery("  QXZVKW ");
      expect(mocks.tmdb).toHaveBeenCalledTimes(1);
    });

    it("also remembers a failed attempt, so a TMDB outage isn't hammered", async () => {
      mocks.tmdb.mockRejectedValue(new Error("HTTP 503"));
      await importMoviesForQuery("fallen leaves");
      await importMoviesForQuery("fallen leaves");
      expect(mocks.tmdb).toHaveBeenCalledTimes(1);
    });

    it("forgets a miss after 10 minutes", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
      mocks.tmdb.mockResolvedValue({ results: [] });

      await importMoviesForQuery("qxzvkw");
      vi.setSystemTime(new Date("2026-10-27T12:09:59Z"));
      await importMoviesForQuery("qxzvkw");
      expect(mocks.tmdb).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date("2026-10-27T12:10:01Z"));
      await importMoviesForQuery("qxzvkw");
      expect(mocks.tmdb).toHaveBeenCalledTimes(2);
    });

    it("does not remember a query that imported something", async () => {
      mocks.tmdb.mockResolvedValue({ results: [hit(1, 50)] });
      await expect(importMoviesForQuery("fallen leaves")).resolves.toBe(1);
      await importMoviesForQuery("fallen leaves");
      expect(mocks.tmdb).toHaveBeenCalledTimes(2);
    });

    it("holds at most 500 queries, dropping the oldest", async () => {
      mocks.tmdb.mockResolvedValue({ results: [] });
      for (let index = 0; index <= 500; index += 1) await importMoviesForQuery(`miss ${index}`);
      expect(mocks.tmdb).toHaveBeenCalledTimes(501);

      await importMoviesForQuery("miss 500"); // newest: still cached
      expect(mocks.tmdb).toHaveBeenCalledTimes(501);
      await importMoviesForQuery("miss 0"); // oldest: evicted
      expect(mocks.tmdb).toHaveBeenCalledTimes(502);
    });
  });

  describe("concurrent calls", () => {
    it("share one TMDB search for the same query", async () => {
      let finish: (value: unknown) => void = () => {};
      mocks.tmdb.mockReturnValue(new Promise((resolve) => (finish = resolve)));

      const first = importMoviesForQuery("fallen leaves");
      const second = importMoviesForQuery("  Fallen Leaves");
      finish({ results: [hit(1, 50)] });

      await expect(Promise.all([first, second])).resolves.toEqual([1, 1]);
      expect(mocks.tmdb).toHaveBeenCalledTimes(1);
      expect(mocks.fetchMovieRow).toHaveBeenCalledTimes(1);
    });

    it("don't share across different queries", async () => {
      mocks.tmdb.mockResolvedValue({ results: [] });
      await Promise.all([importMoviesForQuery("alpha"), importMoviesForQuery("beta")]);
      expect(mocks.tmdb).toHaveBeenCalledTimes(2);
    });
  });

  it("gives up with 0 when the time budget runs out, and never writes late", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    mocks.tmdb.mockReturnValue(new Promise(() => {})); // TMDB hangs

    const pending = importMoviesForQuery("fallen leaves");
    deadline.abort(new DOMException("timed out", "TimeoutError"));

    await expect(pending).resolves.toBe(0);
    expect(upsert).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("logs at most 100 characters of the query", async () => {
    mocks.tmdb.mockRejectedValue(new Error("HTTP 500"));
    await importMoviesForQuery("x".repeat(500));
    const line = String(vi.mocked(console.warn).mock.calls[0][0]);
    expect(line).toContain("x".repeat(100));
    expect(line).not.toContain("x".repeat(101));
  });

  it("does nothing for a blank query", async () => {
    await expect(importMoviesForQuery("   ")).resolves.toBe(0);
    expect(mocks.tmdb).not.toHaveBeenCalled();
  });
});
