import {
  AFFINITY_PSEUDO_COUNT,
  CALIBRATION_SMOOTHING,
  CAST_WEIGHT,
  GENRE_NEGATIVE_LEARNING,
  DEFAULT_RARITY_PREFERENCE,
  MS_PER_DAY,
  MU_PRIOR,
  MU_PRIOR_COUNT,
  RECENCY_HALF_LIFE_DAYS,
  SURPRISE_BETA,
  TOP_CAST_COUNT,
  WEIGHT_CLIP,
  WEIGHT_NOT_INTERESTED,
  WEIGHT_WATCHED_UNRATED,
  WEIGHT_WATCHLIST,
} from "@/lib/recommender/constants";
import { crowdScore5, surpriseOffset } from "@/lib/recommender/features";
import type { RecMovie, RecUserRow } from "@/types/movie";

export type TraitType = "keyword" | "genre" | "director" | "cast";

/** Affinity per trait value, e.g. affinity.keyword.get("space"). Missing = 0. */
export type AffinityMaps = Readonly<Record<TraitType, ReadonlyMap<string, number>>>;

export type Anchor = {
  movieId: number;
  w: number;
  rating: number;
  /** The movie's crowd score on the 0–5 scale; null when it isn't in the catalog. */
  crowdScore5: number | null;
  /** movie_avg5 − catalog_avg5 (absolute, not user-relative); null when not in the catalog. */
  reputation: number | null;
};

export type TasteProfile = {
  /** The user's mean rating, shrunk toward MU_PRIOR. */
  mu: number;
  ratedCount: number;
  affinity: AffinityMaps;
  /** Decayed, clamped weight w per movie the user touched (0-weight rows omitted). */
  weights: ReadonlyMap<number, number>;
  /** Rated movies with w > 0, best first: candidates for "Because you loved …". */
  anchors: readonly Anchor[];
  /** Mean popularity percentile of positively weighted movies. */
  pUser: number;
};

/** mu = (Σr + MU_PRIOR·MU_PRIOR_COUNT) / (n + MU_PRIOR_COUNT). */
export function shrunkMean(ratings: readonly number[]): number {
  const sum = ratings.reduce((total, r) => total + r, 0);
  return (sum + MU_PRIOR * MU_PRIOR_COUNT) / (ratings.length + MU_PRIOR_COUNT);
}

/**
 * A rated movie's undecayed, unclamped weight:
 * (rating − mu) − SURPRISE_BETA × offset, where offset = movie_avg5 − catalog_avg5.
 * Loving an acclaimed classic counts a little less; loving a poorly reviewed
 * film, or disliking an acclaimed one, counts more.
 */
export function ratedBaseWeight(rating: number, mu: number, offset: number): number {
  return rating - mu - SURPRISE_BETA * offset;
}

/**
 * Undecayed weight of one row. The first matching rule wins. `offset` only
 * applies to rated rows (0 when the movie's reputation is unknown).
 */
export function baseWeight(row: RecUserRow, mu: number, offset: number = 0): number {
  if (row.rating !== null) return ratedBaseWeight(row.rating, mu, offset);
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
  /** C, the pool's mean vote_average: catalog_avg5 = C / 2. */
  poolMean: number,
): TasteProfile {
  // Sort so floating-point sums happen in the same order for the same inputs.
  const sorted = [...rows].sort((a, b) => a.movie_id - b.movie_id);
  const ratings = sorted.flatMap((row) => (row.rating === null ? [] : [row.rating]));
  const mu = shrunkMean(ratings);

  // Each rated movie's reputation, and their mean: the user's own baseline.
  const reputations = new Map<number, number>();
  for (const row of sorted) {
    const movie = featuresById.get(row.movie_id);
    if (row.rating !== null && movie) reputations.set(row.movie_id, surpriseOffset(movie, poolMean));
  }
  const meanReputation =
    reputations.size === 0
      ? 0
      : [...reputations.values()].reduce((total, r) => total + r, 0) / reputations.size;

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
  const anchors: Anchor[] = [];
  const positivePercentiles: number[] = [];

  for (const row of sorted) {
    const movie = featuresById.get(row.movie_id);
    const reputation = reputations.get(row.movie_id);
    // Relative to the user's own baseline; 0 for unrated or unknown movies.
    const offset = reputation === undefined ? 0 : reputation - meanReputation;
    // Surprise, then decay, then the clamp (see SURPRISE_BETA, WEIGHT_CLIP).
    const w = clampWeight(baseWeight(row, mu, offset) * recencyDecay(row.updated_at, now));
    if (w === 0) continue;
    weights.set(row.movie_id, w);
    if (row.rating !== null && w > 0) {
      anchors.push({
        movieId: row.movie_id,
        w,
        rating: row.rating,
        crowdScore5: movie ? crowdScore5(movie, poolMean) : null,
        reputation: reputation ?? null,
      });
    }

    if (!movie) continue;
    if (w > 0) positivePercentiles.push(popularityPercentile(movie.popularity));

    const traits = movieTraits(movie);
    for (const type of Object.keys(traits) as TraitType[]) {
      // Genre learns from volume, not from dislikes (see GENRE_NEGATIVE_LEARNING).
      if (type === "genre" && w < 0 && !GENRE_NEGATIVE_LEARNING) continue;
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

/** A genre → share map whose values sum to 1 (empty when there's nothing to describe). */
export type GenreMix = ReadonlyMap<string, number>;

/**
 * The calibration target p(genre): what share of each genre the user's
 * history holds. Every watched movie counts, rated or not, and *including*
 * ones they disliked, so rating honestly never shrinks a genre's share of
 * their recommendations. A movie with k genres gives 1/k to each, times the
 * same recency decay as the profile. The result is smoothed:
 * p = (1 − CALIBRATION_SMOOTHING)·p + CALIBRATION_SMOOTHING·uniform over poolGenres.
 * Empty when no watched movie has genres.
 */
export function genreTarget(
  rows: readonly RecUserRow[],
  featuresById: ReadonlyMap<number, RecMovie>,
  now: Date,
  poolGenres: readonly string[],
): GenreMix {
  const sorted = [...rows].sort((a, b) => a.movie_id - b.movie_id);
  const credits = new Map<string, number>();
  let total = 0;
  for (const row of sorted) {
    if (!row.watched && row.rating === null) continue;
    const movie = featuresById.get(row.movie_id);
    if (!movie) continue;
    const genres = movieTraits(movie).genre;
    if (genres.length === 0) continue;
    const share = recencyDecay(row.updated_at, now) / genres.length;
    for (const genre of genres) credits.set(genre, (credits.get(genre) ?? 0) + share);
    total += share * genres.length;
  }
  if (total === 0) return new Map();

  const uniform = [...new Set(poolGenres)].sort();
  const target = new Map<string, number>();
  for (const [genre, credit] of credits) target.set(genre, (1 - CALIBRATION_SMOOTHING) * (credit / total));
  for (const genre of uniform) {
    target.set(genre, (target.get(genre) ?? 0) + CALIBRATION_SMOOTHING / uniform.length);
  }
  // Sorted keys so iteration (and the debug output) is stable.
  return new Map([...target].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
