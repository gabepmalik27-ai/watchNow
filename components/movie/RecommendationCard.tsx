import { MovieCard } from "@/components/movie/MovieCard";
import type { CatalogMovie } from "@/types/movie";

type RecommendationCardProps = {
  movie: CatalogMovie;
  /** One-line explanation from lib/recommender/explain.ts. */
  reason: string;
};

/** MovieCard plus the reason it was recommended. */
export function RecommendationCard({ movie, reason }: RecommendationCardProps) {
  return (
    <div className="flex flex-col gap-1">
      <MovieCard movie={movie} />
      <p className="line-clamp-2 px-1 text-xs text-muted" title={reason}>
        {reason}
      </p>
    </div>
  );
}
