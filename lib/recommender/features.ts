import {
  BAYES_MIN_VOTES,
  QUALITY_CEIL,
  QUALITY_FLOOR,
  TOP_CAST_COUNT,
} from "@/lib/recommender/constants";
import type { AffinityMaps } from "@/lib/recommender/profile";
import type { RecMovie } from "@/types/movie";

export type RawMatches = {
  keyword: number;
  genre: number;
  people: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, v) => total + v, 0) / values.length;
}

/**
 * Returns pct(x) = (number of pool popularities < x) / (N − 1), clamped to
 * 0–1: 1 = most popular in the pool, 0 = least. Works for any popularity,
 * including movies outside the pool. Null popularity counts as 0.
 */
export function makePercentile(
  popularities: readonly (number | null)[],
): (popularity: number | null) => number {
  const sorted = popularities.map((p) => p ?? 0).sort((a, b) => a - b);
  const denominator = Math.max(1, sorted.length - 1);
  return (popularity) => {
    const x = popularity ?? 0;
    // Binary search: index of the first value >= x = count of values < x.
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return clamp(lo / denominator, 0, 1);
  };
}

/**
 * Un-normalized taste matches for one candidate:
 * - keyword = Σ A_kw[k] / sqrt(|K|)
 * - genre   = mean A_genre[g]
 * - people  = A_dir[director] + mean A_cast[top-3 cast]
 */
export function rawMatches(movie: RecMovie, affinity: AffinityMaps): RawMatches {
  const keywords = [...new Set(movie.keywords.map((k) => k.toLowerCase()))].sort();
  const genres = [...new Set(movie.genres)].sort();
  const cast = [...new Set(movie.top_cast.slice(0, TOP_CAST_COUNT))].sort();

  const keywordSum = keywords.reduce((total, k) => total + (affinity.keyword.get(k) ?? 0), 0);
  const keyword = keywords.length === 0 ? 0 : keywordSum / Math.sqrt(keywords.length);
  const genre = mean(genres.map((g) => affinity.genre.get(g) ?? 0));
  const director = movie.director ? (affinity.director.get(movie.director) ?? 0) : 0;
  const people = director + mean(cast.map((name) => affinity.cast.get(name) ?? 0));

  return { keyword, genre, people };
}

/** (x − min) / (max − min) for each value; all 0 when every value is equal. */
export function minMaxNormalize(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0);
  return values.map((v) => (v - min) / (max - min));
}

/** C: mean vote_average over the pool, skipping nulls. */
export function meanVoteAverage(pool: readonly RecMovie[]): number {
  return mean(pool.flatMap((m) => (m.vote_average === null ? [] : [m.vote_average])));
}

/** WR = v/(v+m)·R + m/(v+m)·C. */
export function bayesianRating(
  voteAverage: number,
  voteCount: number,
  poolMean: number,
  minVotes: number = BAYES_MIN_VOTES,
): number {
  const v = Math.max(0, voteCount);
  return (v / (v + minVotes)) * voteAverage + (minVotes / (v + minVotes)) * poolMean;
}

/** Bayesian rating mapped QUALITY_FLOOR→0 and QUALITY_CEIL→1, clamped. */
export function qualityScore(movie: RecMovie, poolMean: number): number {
  const wr = bayesianRating(movie.vote_average ?? poolMean, movie.vote_count ?? 0, poolMean);
  return clamp((wr - QUALITY_FLOOR) / (QUALITY_CEIL - QUALITY_FLOOR), 0, 1);
}

/** 1 − |percentile − target|. */
export function rarityFit(percentile: number, target: number): number {
  return 1 - Math.abs(percentile - target);
}
