import { describe, expect, it } from "vitest";
import {
  applyRating,
  applyToggleWatched,
  applyToggleWatchlist,
  emptyUserMovie,
} from "@/lib/user-movie-rules";
import type { UserMovie } from "@/types/movie";

const ID = 27205;
const row = (patch: Partial<UserMovie>): UserMovie => ({ ...emptyUserMovie(ID), ...patch });

/** The database CHECK: a watched movie is never on the watchlist. */
const watchlistInvariant = (m: UserMovie) => !(m.watched && m.on_watchlist);

describe("watched never stays on the watchlist", () => {
  it("rating a watchlisted movie marks it watched and removes it from the watchlist", () => {
    const next = applyRating(row({ on_watchlist: true }), ID, 4.5);
    expect(next).toMatchObject({ rating: 4.5, watched: true, on_watchlist: false });
    expect(watchlistInvariant(next)).toBe(true);
  });

  it("rating a movie with no row creates a watched, rated row", () => {
    expect(applyRating(undefined, ID, 3)).toEqual(row({ rating: 3, watched: true }));
  });

  it("marking a watchlisted movie watched removes it from the watchlist", () => {
    const next = applyToggleWatched(row({ on_watchlist: true }), ID);
    expect(next).toMatchObject({ watched: true, on_watchlist: false });
  });

  it("a watched movie can't be added to the watchlist", () => {
    expect(applyToggleWatchlist(row({ watched: true }), ID)).toBeNull();
  });

  it("an unwatched movie toggles on and off the watchlist", () => {
    const on = applyToggleWatchlist(undefined, ID);
    expect(on).toEqual(row({ on_watchlist: true }));
    expect(applyToggleWatchlist(on ?? undefined, ID)).toEqual(row({ on_watchlist: false }));
  });

  it("every transition from every reachable state keeps the invariant", () => {
    const states = [undefined, row({}), row({ on_watchlist: true }), row({ watched: true })];
    for (const state of states) {
      const results = [
        applyRating(state, ID, 2),
        applyToggleWatched(state, ID),
        applyToggleWatchlist(state, ID),
      ];
      for (const result of results) if (result) expect(watchlistInvariant(result)).toBe(true);
    }
  });
});
