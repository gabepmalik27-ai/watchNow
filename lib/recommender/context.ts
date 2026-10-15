import {
  CONTEXT_HITS_FOR_FULL_MATCH,
  CONTEXT_PENALTY_PER_GENRE,
  DISCOVERY_MAX,
  EXPERIENCE_PROFILES,
  MOOD_PROFILES,
  TIME_RANGES,
  type ContextProfile,
  type Experience,
  type Mood,
  type TimeOption,
} from "@/lib/recommender/constants";
import { clamp } from "@/lib/recommender/features";
import type { RecMovie } from "@/types/movie";

/** What the Recommend page sends. Null = not chosen. */
export type RecommendContext = {
  mood: Mood | null;
  experience: Experience | null;
  time: TimeOption | null;
  /** 0 = Safe Pick … 100 = Surprise Me. */
  discovery: number;
};

/** Hard runtime filter. With a time chosen, a null runtime never passes. */
export function passesTimeFilter(runtime: number | null, time: TimeOption | null): boolean {
  if (time === null) return true;
  if (runtime === null) return false;
  const { min, max } = TIME_RANGES[time];
  return (min === null || runtime >= min) && (max === null || runtime <= max);
}

/** The mood/experience profiles the user chose, in a fixed order. */
function selectedProfiles(context: RecommendContext): ContextProfile[] {
  return [
    context.mood ? MOOD_PROFILES[context.mood] : null,
    context.experience ? EXPERIENCE_PROFILES[context.experience] : null,
  ].filter((profile): profile is ContextProfile => profile !== null);
}

/** True when the context feature applies (a mood or an experience is chosen). */
export function hasContextSelection(context: RecommendContext): boolean {
  return selectedProfiles(context).length > 0;
}

/**
 * Per selected dimension d:
 *   hits_d  = |genres ∩ S_d| + (1 if any keyword of d matches)
 *   match_d = min(1, hits_d / CONTEXT_HITS_FOR_FULL_MATCH)
 * contextMatch = clamp(mean_d match_d − 0.5 · |genres ∩ penalized|, 0, 1).
 */
export function contextMatch(movie: RecMovie, context: RecommendContext): number {
  const profiles = selectedProfiles(context);
  if (profiles.length === 0) return 0;
  const genres = new Set(movie.genres);
  const keywords = new Set(movie.keywords.map((k) => k.toLowerCase()));

  const matches = profiles.map((profile) => {
    const genreHits = profile.genres.filter((g) => genres.has(g)).length;
    const keywordHit = profile.keywords.some((k) => keywords.has(k)) ? 1 : 0;
    return Math.min(1, (genreHits + keywordHit) / CONTEXT_HITS_FOR_FULL_MATCH);
  });
  const meanMatch = matches.reduce((total, m) => total + m, 0) / matches.length;

  const penalized = new Set(profiles.flatMap((profile) => profile.penalize));
  const penaltyHits = [...penalized].filter((g) => genres.has(g)).length;

  return clamp(meanMatch - CONTEXT_PENALTY_PER_GENRE * penaltyHits, 0, 1);
}

/** Discovery 0 (Safe Pick) → target 1 (most popular); 100 (Surprise Me) → 0. */
export function rarityTargetFromDiscovery(discovery: number): number {
  return 1 - clamp(discovery, 0, DISCOVERY_MAX) / DISCOVERY_MAX;
}

/** "Under 90 min · Funny", using only the chosen parts. */
export function contextLabel(context: RecommendContext): string {
  return [
    context.time ? TIME_RANGES[context.time].label : null,
    context.mood,
    context.experience,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
