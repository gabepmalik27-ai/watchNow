import {
  FEATURES,
  PERSONAL_FEATURES,
  type FeatureName,
  type WeightSet,
} from "@/lib/recommender/constants";
import {
  minMaxNormalize,
  qualityScore,
  rarityFit,
  rawMatches,
  type RawMatches,
} from "@/lib/recommender/features";
import type { TasteProfile } from "@/lib/recommender/profile";
import type { RecMovie } from "@/types/movie";

export type FeatureValues = Record<FeatureName, number>;

export type ScoreBreakdown = {
  /** Un-normalized taste matches. */
  raw: RawMatches;
  /** Each feature in 0–1 (keyword/genre/people after min-max over the candidates). */
  features: FeatureValues;
  /** Effective weights after cold start / no-context renormalization; they sum to 1. */
  weights: WeightSet;
  /** weights[f] · features[f]; they sum to score. */
  contributions: FeatureValues;
  score: number;
  coldStart: boolean;
  /** The candidate's popularity percentile in the pool (0 = least popular). */
  popularityPercentile: number;
  /** The rarity target the percentile was compared with. */
  rarityTarget: number;
};

export type ScoredCandidate = {
  movie: RecMovie;
  breakdown: ScoreBreakdown;
};

/**
 * Zeroes the personal features during cold start and the context feature
 * when no context is chosen, then divides by the remaining sum so the
 * weights add up to 1.
 */
export function effectiveWeights(
  base: WeightSet,
  options: { coldStart: boolean; hasContext: boolean },
): WeightSet {
  const kept = Object.fromEntries(
    FEATURES.map((feature) => {
      const dropped =
        (options.coldStart && PERSONAL_FEATURES.includes(feature)) ||
        (feature === "context" && !options.hasContext);
      return [feature, dropped ? 0 : base[feature]];
    }),
  ) as Record<FeatureName, number>;
  const total = FEATURES.reduce((sum, feature) => sum + kept[feature], 0);
  if (total === 0) return kept;
  return Object.fromEntries(
    FEATURES.map((feature) => [feature, kept[feature] / total]),
  ) as WeightSet;
}

export type ScoreOptions = {
  candidates: readonly RecMovie[];
  profile: TasteProfile;
  popularityPercentile: (popularity: number | null) => number;
  /** C, the pool's mean vote_average. */
  poolMean: number;
  weights: WeightSet;
  coldStart: boolean;
  rarityTarget: number;
  /** contextMatch per movie; omitted (→ 0) when no context is chosen. */
  contextMatch?: (movie: RecMovie) => number;
};

/** score desc, then quality desc, then id asc. */
export function compareScored(a: ScoredCandidate, b: ScoredCandidate): number {
  return (
    b.breakdown.score - a.breakdown.score ||
    b.breakdown.features.quality - a.breakdown.features.quality ||
    a.movie.id - b.movie.id
  );
}

/** Scores every candidate and returns them best first. */
export function scoreCandidates(options: ScoreOptions): ScoredCandidate[] {
  const { candidates, profile, weights } = options;
  const raws = candidates.map((movie) => rawMatches(movie, profile.affinity));
  const keyword = minMaxNormalize(raws.map((r) => r.keyword));
  const genre = minMaxNormalize(raws.map((r) => r.genre));
  const people = minMaxNormalize(raws.map((r) => r.people));

  const scored = candidates.map((movie, index): ScoredCandidate => {
    const percentile = options.popularityPercentile(movie.popularity);
    const features: FeatureValues = {
      context: options.contextMatch ? options.contextMatch(movie) : 0,
      keyword: keyword[index],
      genre: genre[index],
      people: people[index],
      quality: qualityScore(movie, options.poolMean),
      rarity: rarityFit(percentile, options.rarityTarget),
    };
    const contributions = Object.fromEntries(
      FEATURES.map((feature) => [feature, weights[feature] * features[feature]]),
    ) as FeatureValues;
    const score = FEATURES.reduce((sum, feature) => sum + contributions[feature], 0);
    return {
      movie,
      breakdown: {
        raw: raws[index],
        features,
        weights,
        contributions,
        score,
        coldStart: options.coldStart,
        popularityPercentile: percentile,
        rarityTarget: options.rarityTarget,
      },
    };
  });

  return scored.sort(compareScored);
}

/**
 * Takes results in order, skipping any whose director already has
 * `maxPerDirector` results. Movies without a director are never capped.
 */
export function applyDirectorCap(
  sorted: readonly ScoredCandidate[],
  limit: number,
  maxPerDirector: number,
): ScoredCandidate[] {
  const perDirector = new Map<string, number>();
  const result: ScoredCandidate[] = [];
  for (const candidate of sorted) {
    if (result.length >= limit) break;
    const director = candidate.movie.director;
    if (director) {
      const count = perDirector.get(director) ?? 0;
      if (count >= maxPerDirector) continue;
      perDirector.set(director, count + 1);
    }
    result.push(candidate);
  }
  return result;
}
