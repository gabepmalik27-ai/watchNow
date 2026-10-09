import {
  AFFINITY_PSEUDO_COUNT,
  CAST_WEIGHT,
  DEFAULT_RARITY_PREFERENCE,
  MS_PER_DAY,
  MU_PRIOR,
  MU_PRIOR_COUNT,
  RECENCY_HALF_LIFE_DAYS,
  TOP_CAST_COUNT,
  WEIGHT_CLIP,
  WEIGHT_NOT_INTERESTED,
  WEIGHT_WATCHED_UNRATED,
  WEIGHT_WATCHLIST,
} from "@/lib/recommender/constants";
import type { RecMovie, RecUserRow } from "@/types/movie";

export type TraitType = "keyword" | "genre" | "director" | "cast";

/** Affinity per trait value, e.g. affinity.keyword.get("space"). Missing = 0. */
export type AffinityMaps = Readonly<Record<TraitType, ReadonlyMap<string, number>>>;

export type TasteProfile = {
  /** The user's mean rating, shrunk toward MU_PRIOR. */
  mu: number;
  ratedCount: number;
  affinity: AffinityMaps;
  /** Decayed, clamped weight w per movie the user touched (0-weight rows omitted). */
  weights: ReadonlyMap<number, number>;
  /** Rated movies with w > 0, best first: candidates for "Because you loved …". */
  anchors: readonly { movieId: number; w: number }[];
  /** Mean popularity percentile of positively weighted movies. */
  pUser: number;
};

/** mu = (Σr + MU_PRIOR·MU_PRIOR_COUNT) / (n + MU_PRIOR_COUNT). */
export function shrunkMean(ratings: readonly number[]): number {
  const sum = ratings.reduce((total, r) => total + r, 0);
  return (sum + MU_PRIOR * MU_PRIOR_COUNT) / (ratings.length + MU_PRIOR_COUNT);
}

/** Undecayed weight of one row. The first matching rule wins. */
export function baseWeight(row: RecUserRow, mu: number): number {
  if (row.rating !== null) return row.rating - mu;
  if (row.not_interested) return WEIGHT_NOT_INTERESTED;
  if (row.watched) return WEIGHT_WATCHED_UNRATED;
  if (row.on_watchlist) return WEIGHT_WATCHLIST;
  return 0;
}

/** 0.5^(age_days / half-life); a timestamp in the future counts as age 0. */
export function recencyDecay(updatedAt: string, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - Date.parse(updatedAt)) / MS_PER_DAY);
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

/** Limits one movie's influence to [−WEIGHT_CLIP, +WEIGHT_CLIP]. */
export function clampWeight(w: number): number {
  return Math.min(WEIGHT_CLIP, Math.max(-WEIGHT_CLIP, w));
}

/** The distinct trait values a movie contributes, per type, sorted. */
export function movieTraits(movie: RecMovie): Record<TraitType, string[]> {
  const unique = (values: readonly string[]) => [...new Set(values)].sort();
  return {
    keyword: unique(movie.keywords.map((k) => k.toLowerCase())),
    genre: unique(movie.genres),
    director: movie.director ? [movie.director] : [],
    cast: unique(movie.top_cast.slice(0, TOP_CAST_COUNT)),
  };
}

const TRAIT_SHARE: Readonly<Record<TraitType, number>> = {
  keyword: 1,
  genre: 1,
  director: 1,
  cast: CAST_WEIGHT,
};

/**
 * Builds the taste profile from the user's rows.
 *
 * featuresById must contain every movie in `rows` the catalog knows; rows
 * without features still count toward mu and ratedCount but add no traits.
 * popularityPercentile maps a raw popularity to 0–1 against the pool.
 */
export function buildProfile(
  rows: readonly RecUserRow[],
  featuresById: ReadonlyMap<number, RecMovie>,
  popularityPercentile: (popularity: number | null) => number,
  now: Date,
): TasteProfile {
  // Sort so floating-point sums happen in the same order for the same inputs.
  const sorted = [...rows].sort((a, b) => a.movie_id - b.movie_id);
  const ratings = sorted.flatMap((row) => (row.rating === null ? [] : [row.rating]));
  const mu = shrunkMean(ratings);

  const sums: Record<TraitType, Map<string, number>> = {
    keyword: new Map(),
    genre: new Map(),
    director: new Map(),
    cast: new Map(),
  };
  const counts: Record<TraitType, Map<string, number>> = {
    keyword: new Map(),
    genre: new Map(),
    director: new Map(),
    cast: new Map(),
  };
  const weights = new Map<number, number>();
  const anchors: { movieId: number; w: number }[] = [];
  const positivePercentiles: number[] = [];

  for (const row of sorted) {
    // Clamped after decay, before affinities: see WEIGHT_CLIP.
    const w = clampWeight(baseWeight(row, mu) * recencyDecay(row.updated_at, now));
    if (w === 0) continue;
    weights.set(row.movie_id, w);
    if (row.rating !== null && w > 0) anchors.push({ movieId: row.movie_id, w });

    const movie = featuresById.get(row.movie_id);
    if (!movie) continue;
    if (w > 0) positivePercentiles.push(popularityPercentile(movie.popularity));

    const traits = movieTraits(movie);
    for (const type of Object.keys(traits) as TraitType[]) {
      for (const value of traits[type]) {
        sums[type].set(value, (sums[type].get(value) ?? 0) + TRAIT_SHARE[type] * w);
        counts[type].set(value, (counts[type].get(value) ?? 0) + 1);
      }
    }
  }

  const affinity = Object.fromEntries(
    (Object.keys(sums) as TraitType[]).map((type) => [
      type,
      new Map(
        [...sums[type]].map(([value, sum]) => [
          value,
          sum / ((counts[type].get(value) ?? 0) + AFFINITY_PSEUDO_COUNT),
        ]),
      ),
    ]),
  ) as Record<TraitType, Map<string, number>>;

  anchors.sort((a, b) => b.w - a.w || a.movieId - b.movieId);

  const pUser =
    positivePercentiles.length === 0
      ? DEFAULT_RARITY_PREFERENCE
      : positivePercentiles.reduce((total, p) => total + p, 0) / positivePercentiles.length;

  return { mu, ratedCount: ratings.length, affinity, weights, anchors, pUser };
}
