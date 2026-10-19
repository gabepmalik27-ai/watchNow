/** The user rating scale: integers 1–10, each with a label. Pure, no React. */

export const RATING_MIN = 1;
export const RATING_MAX = 10;
/** Label anchor shown to users; team may revisit. Not used by the recommender (see MU_PRIOR). */
export const RATING_AVERAGE_ANCHOR = 6;

export const RATING_LABELS: Readonly<Record<number, string>> = {
  1: "Awful",
  2: "Very bad",
  3: "Bad",
  4: "Below average",
  5: "Meh",
  6: "Average",
  7: "Good",
  8: "Great",
  9: "Excellent",
  10: "All-time favorite",
};

/** Every valid rating, 1 through 10. */
export const RATING_VALUES: readonly number[] = Array.from(
  { length: RATING_MAX - RATING_MIN + 1 },
  (_, i) => RATING_MIN + i,
);

export function isValidRating(n: number): boolean {
  return Number.isInteger(n) && n >= RATING_MIN && n <= RATING_MAX;
}

/** The label for a valid rating, or "" for anything else. */
export function ratingLabel(n: number): string {
  return RATING_LABELS[n] ?? "";
}

/** "7/10" */
export function formatUserRating(n: number): string {
  return `${n}/${RATING_MAX}`;
}

/** TMDB's vote_average is already 0–10: "7.8/10", or "—" when unknown. */
export function formatAudienceRating(voteAverage: number | null): string {
  return voteAverage === null ? "—" : `${voteAverage.toFixed(1)}/${RATING_MAX}`;
}
