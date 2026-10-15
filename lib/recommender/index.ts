import {
  COLD_START_MIN_RATINGS,
  FOR_YOU_WEIGHTS,
  MAX_PER_DIRECTOR,
  RECOMMEND_WEIGHTS,
} from "@/lib/recommender/constants";
import {
  contextMatch,
  hasContextSelection,
  passesTimeFilter,
  rarityTargetFromDiscovery,
  type RecommendContext,
} from "@/lib/recommender/context";
import { explain } from "@/lib/recommender/explain";
import { makePercentile, meanVoteAverage } from "@/lib/recommender/features";
import { buildProfile, type TasteProfile } from "@/lib/recommender/profile";
import {
  applyDirectorCapWithStats,
  effectiveWeights,
  scoreCandidates,
  type ScoreBreakdown,
} from "@/lib/recommender/score";
import type { CatalogMovie, RecMovie, RecUserRow } from "@/types/movie";

export type { RecommendContext } from "@/lib/recommender/context";
export type { ScoreBreakdown } from "@/lib/recommender/score";

export type Recommendation = {
  movieId: number;
  title: string;
  score: number;
  reason: string;
  breakdown: ScoreBreakdown;
};

/**
 * Where candidates went, so a list shorter than requested can be explained
 * (shown in the ?debug=1 panels).
 */
export type RankDiagnostics = {
  requested: number;
  returned: number;
  poolSize: number;
  /** Pool movies the user already rated, watched, watchlisted or dismissed. */
  excludedByUser: number;
  /** Removed by Recommend's hard runtime filter (0 for For You). */
  removedByTimeFilter: number;
  /** Passed over because their director already had MAX_PER_DIRECTOR results. */
  removedByDirectorCap: number;
  /** Scored but dropped because the catalog row was missing (set by the server). */
  missingFromCatalog: number;
};

export type RecommendationSet = {
  results: Recommendation[];
  coldStart: boolean;
  ratedCount: number;
  diagnostics: RankDiagnostics;
};

type RankInput = {
  /** The candidate pool (top movies by vote_count). */
  pool: readonly RecMovie[];
  rows: readonly RecUserRow[];
  /** Features for the user's movies that are not in the pool. */
  userFeatures: readonly RecMovie[];
  now: Date;
  limit: number;
};

/** Anything the user has rated, watched, watchlisted or dismissed. */
function excludedIds(rows: readonly RecUserRow[]): Set<number> {
  return new Set(
    rows
      .filter((r) => r.rating !== null || r.watched || r.on_watchlist || r.not_interested)
      .map((r) => r.movie_id),
  );
}

function prepare(input: RankInput) {
  const featuresById = new Map<number, RecMovie>();
  for (const movie of input.userFeatures) featuresById.set(movie.id, movie);
  for (const movie of input.pool) featuresById.set(movie.id, movie);
  const popularityPercentile = makePercentile(input.pool.map((m) => m.popularity));
  const poolMean = meanVoteAverage(input.pool);
  const profile = buildProfile(input.rows, featuresById, popularityPercentile, input.now, poolMean);
  const excluded = excludedIds(input.rows);
  // Sorted by id so the result never depends on the order the pool arrived in.
  const candidates = input.pool
    .filter((movie) => !excluded.has(movie.id))
    .sort((a, b) => a.id - b.id);
  return {
    featuresById,
    popularityPercentile,
    profile,
    candidates,
    poolMean,
    coldStart: profile.ratedCount < COLD_START_MIN_RATINGS,
  };
}

function toRecommendation(
  scored: ReturnType<typeof scoreCandidates>[number],
  profile: TasteProfile,
  featuresById: ReadonlyMap<number, RecMovie>,
  context: RecommendContext | null,
): Recommendation {
  return {
    movieId: scored.movie.id,
    title: scored.movie.title,
    score: scored.breakdown.score,
    reason: explain(scored, profile, featuresById, context),
    breakdown: scored.breakdown,
  };
}

/** For You / Home: taste profile only, rarity target = pUser, ≤ 2 per director. */
export function rankForYou(input: RankInput): RecommendationSet {
  const prep = prepare(input);
  const scored = scoreCandidates({
    candidates: prep.candidates,
    profile: prep.profile,
    popularityPercentile: prep.popularityPercentile,
    poolMean: prep.poolMean,
    weights: effectiveWeights(FOR_YOU_WEIGHTS, { coldStart: prep.coldStart, hasContext: false }),
    coldStart: prep.coldStart,
    rarityTarget: prep.profile.pUser,
  });
  const top = applyDirectorCapWithStats(scored, input.limit, MAX_PER_DIRECTOR);
  return {
    results: top.results.map((s) => toRecommendation(s, prep.profile, prep.featuresById, null)),
    coldStart: prep.coldStart,
    ratedCount: prep.profile.ratedCount,
    diagnostics: {
      requested: input.limit,
      returned: top.results.length,
      poolSize: input.pool.length,
      excludedByUser: input.pool.length - prep.candidates.length,
      removedByTimeFilter: 0,
      removedByDirectorCap: top.skipped,
      missingFromCatalog: 0,
    },
  };
}

/** Recommend: hard time filter, context feature, rarity target from Discovery. */
export function rankForContext(
  input: RankInput & { context: RecommendContext },
): RecommendationSet {
  const prep = prepare(input);
  const { context } = input;
  const hasContext = hasContextSelection(context);
  const timed = prep.candidates.filter((m) => passesTimeFilter(m.runtime_min, context.time));
  const scored = scoreCandidates({
    candidates: timed,
    profile: prep.profile,
    popularityPercentile: prep.popularityPercentile,
    poolMean: prep.poolMean,
    weights: effectiveWeights(RECOMMEND_WEIGHTS, { coldStart: prep.coldStart, hasContext }),
    coldStart: prep.coldStart,
    rarityTarget: rarityTargetFromDiscovery(context.discovery),
    contextMatch: hasContext ? (movie) => contextMatch(movie, context) : undefined,
  });
  const top = scored.slice(0, input.limit);
  return {
    results: top.map((s) => toRecommendation(s, prep.profile, prep.featuresById, context)),
    coldStart: prep.coldStart,
    ratedCount: prep.profile.ratedCount,
    diagnostics: {
      requested: input.limit,
      returned: top.length,
      poolSize: input.pool.length,
      excludedByUser: input.pool.length - prep.candidates.length,
      removedByTimeFilter: prep.candidates.length - timed.length,
      removedByDirectorCap: 0,
      missingFromCatalog: 0,
    },
  };
}

/** A recommendation with its catalog row, as the API and pages receive it. */
export type RecommendedMovie = Recommendation & { movie: CatalogMovie };

export type RecommendationResponse = Omit<RecommendationSet, "results"> & {
  results: RecommendedMovie[];
};
