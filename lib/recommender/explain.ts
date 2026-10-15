import { EXPLAIN_SHARED_TERMS, REASON_COLD_START } from "@/lib/recommender/constants";
import { contextLabel, hasContextSelection, type RecommendContext } from "@/lib/recommender/context";
import { movieTraits, type TasteProfile } from "@/lib/recommender/profile";
import type { ScoredCandidate } from "@/lib/recommender/score";
import type { RecMovie } from "@/types/movie";

type Term = { name: string; affinity: number };

/** Highest affinity first, then alphabetical. */
function byAffinity(a: Term, b: Term): number {
  return b.affinity - a.affinity || a.name.localeCompare(b.name);
}

/**
 * One reason line per result. The first rule that applies wins:
 * 1. context dominates → "Under 90 min · Funny"
 * 2. cold start → "Popular and highly rated"
 * 3. best anchor (rated, w > 0) by positive shared keyword + genre affinity
 *    → "Because you loved {title}: {a}, {b}"
 * 4. best liked genre → "Matches your taste for {genre}", else rule 2's text
 */
export function explain(
  candidate: ScoredCandidate,
  profile: TasteProfile,
  featuresById: ReadonlyMap<number, RecMovie>,
  context: RecommendContext | null,
): string {
  const { contributions, coldStart } = candidate.breakdown;

  if (context && hasContextSelection(context)) {
    const personal = contributions.keyword + contributions.genre + contributions.people;
    if (contributions.context >= personal) return contextLabel(context);
  }

  if (coldStart) return REASON_COLD_START;

  const candidateTraits = movieTraits(candidate.movie);
  const candidateKeywords = new Set(candidateTraits.keyword);
  const candidateGenres = new Set(candidateTraits.genre);

  let best: { title: string; overlap: number; terms: Term[] } | null = null;
  // Anchors are already sorted by w desc, then id asc, so strict ">" keeps
  // the tie-break rule (larger w, then lower id).
  for (const anchor of profile.anchors) {
    const anchorMovie = featuresById.get(anchor.movieId);
    if (!anchorMovie) continue;
    const traits = movieTraits(anchorMovie);
    const keywords: Term[] = traits.keyword
      .filter((k) => candidateKeywords.has(k))
      .map((name) => ({ name, affinity: profile.affinity.keyword.get(name) ?? 0 }))
      .filter((term) => term.affinity > 0)
      .sort(byAffinity);
    const genres: Term[] = traits.genre
      .filter((g) => candidateGenres.has(g))
      .map((name) => ({ name, affinity: profile.affinity.genre.get(name) ?? 0 }))
      .filter((term) => term.affinity > 0)
      .sort(byAffinity);
    const overlap = [...keywords, ...genres].reduce((total, term) => total + term.affinity, 0);
    if (overlap > 0 && (best === null || overlap > best.overlap)) {
      best = {
        title: anchorMovie.title,
        overlap,
        terms: [...keywords, ...genres].slice(0, EXPLAIN_SHARED_TERMS),
      };
    }
  }
  if (best) {
    return `Because you loved ${best.title}: ${best.terms.map((t) => t.name).join(", ")}`;
  }

  const genre = [...candidateGenres]
    .map((name) => ({ name, affinity: profile.affinity.genre.get(name) ?? 0 }))
    .filter((term) => term.affinity > 0)
    .sort(byAffinity)[0];
  return genre ? `Matches your taste for ${genre.name}` : REASON_COLD_START;
}
