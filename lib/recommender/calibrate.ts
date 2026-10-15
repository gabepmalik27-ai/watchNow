import { CALIBRATION_CANDIDATES } from "@/lib/recommender/constants";
import type { GenreMix } from "@/lib/recommender/profile";
import { compareScored, type ScoredCandidate } from "@/lib/recommender/score";
import type { RecMovie } from "@/types/movie";

/** Each of a movie's k distinct genres gets 1/k. */
export function genreCredits(movie: Pick<RecMovie, "genres">): Map<string, number> {
  const genres = [...new Set(movie.genres)].sort();
  return new Map(genres.map((genre) => [genre, 1 / genres.length]));
}

/** The genre mix of a list (1/k credit per movie), normalized to sum to 1. */
export function mixOf(movies: readonly Pick<RecMovie, "genres">[]): GenreMix {
  const sums = new Map<string, number>();
  let total = 0;
  for (const movie of movies) {
    for (const [genre, credit] of genreCredits(movie)) {
      sums.set(genre, (sums.get(genre) ?? 0) + credit);
      total += credit;
    }
  }
  if (total === 0) return new Map();
  return new Map(
    [...sums]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([genre, sum]) => [genre, sum / total]),
  );
}

/** L1(p, q) = Σ over the union of genres of |p(g) − q(g)|; 0–2. */
export function l1Distance(p: GenreMix, q: GenreMix): number {
  const genres = [...new Set([...p.keys(), ...q.keys()])].sort();
  return genres.reduce((total, g) => total + Math.abs((p.get(g) ?? 0) - (q.get(g) ?? 0)), 0);
}

export type CalibrationResult = {
  results: ScoredCandidate[];
  /** Candidates in the window left out while their director was at the cap. */
  skippedByDirectorCap: number;
};

/**
 * Greedy calibrated re-rank. Takes the top CALIBRATION_CANDIDATES by score,
 * normalizes each score by the best one (ns = score / max, so 1 for the top
 * candidate), then fills `k` slots one at a time
 * with the candidate maximizing
 *   (1 − lambda) · ns − lambda · L1(target, q_after_adding)
 * where q is the list's genre mix so far (1/k credit per movie). Ties go to
 * the score order (score, quality, id), so lambda = 0 is exactly the score
 * order. A director already holding `maxPerDirector` slots is ineligible.
 *
 * score / max rather than min-max: min-max would stretch whatever gap the
 * window has to 0–1, so near-identical candidates would look far apart and
 * calibration would barely move. Dividing by the max keeps real gaps real.
 */
export function calibrate(
  scored: readonly ScoredCandidate[],
  target: GenreMix,
  k: number,
  lambda: number,
  maxPerDirector: number = Infinity,
  windowSize: number = CALIBRATION_CANDIDATES,
): CalibrationResult {
  const window = [...scored].sort(compareScored).slice(0, windowSize);
  const maxScore = Math.max(0, ...window.map((c) => c.breakdown.score));
  const ns = window.map((c) => (maxScore > 0 ? c.breakdown.score / maxScore : 0));
  const credits = window.map((c) => genreCredits(c.movie));

  const sums = new Map<string, number>();
  let total = 0;
  const picked = new Set<number>();
  const perDirector = new Map<string, number>();
  const results: ScoredCandidate[] = [];

  const capped = (candidate: ScoredCandidate) => {
    const director = candidate.movie.director;
    return director !== null && (perDirector.get(director) ?? 0) >= maxPerDirector;
  };

  while (results.length < k) {
    let best = -1;
    let bestValue = -Infinity;
    // `window` is in score order, so strict ">" leaves ties with the better-scored candidate.
    for (let i = 0; i < window.length; i++) {
      if (picked.has(i) || capped(window[i])) continue;
      let value = (1 - lambda) * ns[i];
      if (lambda > 0) {
        const next = new Map(sums);
        let nextTotal = total;
        for (const [genre, credit] of credits[i]) {
          next.set(genre, (next.get(genre) ?? 0) + credit);
          nextTotal += credit;
        }
        const q: GenreMix =
          nextTotal === 0 ? new Map() : new Map([...next].map(([g, s]) => [g, s / nextTotal]));
        value -= lambda * l1Distance(target, q);
      }
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    }
    if (best === -1) break;

    picked.add(best);
    const chosen = window[best];
    results.push(chosen);
    for (const [genre, credit] of credits[best]) {
      sums.set(genre, (sums.get(genre) ?? 0) + credit);
      total += credit;
    }
    if (chosen.movie.director) {
      perDirector.set(chosen.movie.director, (perDirector.get(chosen.movie.director) ?? 0) + 1);
    }
  }

  const skippedByDirectorCap = window.filter((c, i) => !picked.has(i) && capped(c)).length;
  return { results, skippedByDirectorCap };
}
