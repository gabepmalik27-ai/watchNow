import { describe, expect, it } from "vitest";
import {
  applyRating,
  applyRemoveRating,
  applyToggleWatched,
  applyToggleWatchlist,
  emptyUserMovie,
} from "@/lib/user-movie-rules";
import type { UserMovie } from "@/types/movie";

const ID = 27205;
const row = (patch: Partial<UserMovie>): UserMovie => ({ ...emptyUserMovie(ID), ...patch });

/** The database CHECKs: a watched movie is never on the watchlist; a rated movie is always watched. */
const watchlistInvariant = (m: UserMovie) => !(m.watched && m.on_watchlist);
const ratedInvariant = (m: UserMovie) => !(m.rating !== null && !m.watched);

describe("watched never stays on the watchlist", () => {
  it("rating a watchlisted movie marks it watched and removes it from the watchlist", () => {
    const next = applyRating(row({ on_watchlist: true }), ID, 9);
    expect(next).toMatchObject({ rating: 9, watched: true, on_watchlist: false });
    expect(watchlistInvariant(next)).toBe(true);
  });

  it("rating a movie with no row creates a watched, rated row", () => {
    expect(applyRating(undefined, ID, 6)).toEqual(row({ rating: 6, watched: true }));
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

});

describe("a rated movie is always watched", () => {
  it("un-marking watched on a rated movie is blocked", () => {
    expect(applyToggleWatched(row({ rating: 8, watched: true }), ID)).toBeNull();
  });

  it("an unrated watched movie can still be un-marked", () => {
    expect(applyToggleWatched(row({ watched: true }), ID)).toEqual(row({ watched: false }));
  });

  it("removing a rating clears the rating and keeps the movie watched", () => {
    const before = row({ rating: 7, watched: true, not_interested: false });
    expect(applyRemoveRating(before)).toEqual(row({ rating: null, watched: true }));
  });

  it("removing a rating from an unrated movie changes nothing", () => {
    expect(applyRemoveRating(row({ watched: true }))).toBeNull();
    expect(applyRemoveRating(undefined)).toBeNull();
  });

  it("removing a rating doesn't touch the row it came from, so Undo can restore it", () => {
    const before = row({ rating: 9, watched: true });
    applyRemoveRating(before);
    expect(before).toEqual(row({ rating: 9, watched: true }));
  });
});

describe("both invariants", () => {
  it("every transition from every valid state keeps both invariants", () => {
    const states = [
      undefined,
      row({}),
      row({ on_watchlist: true }),
      row({ watched: true }),
      row({ watched: true, rating: 5 }),
    ];
    for (const state of states) {
      const results = [
        applyRating(state, ID, 4),
        applyToggleWatched(state, ID),
        applyToggleWatchlist(state, ID),
        applyRemoveRating(state),
      ];
      for (const result of results) {
        if (!result) continue;
        expect(watchlistInvariant(result)).toBe(true);
        expect(ratedInvariant(result)).toBe(true);
      }
    }
  });
});
