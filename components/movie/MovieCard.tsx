"use client";

import { MovieDetailButton } from "@/components/movie/MovieDetailButton";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { formatAudienceRating } from "@/lib/rating-scale";
import type { CatalogMovie } from "@/types/movie";

type MovieCardProps = {
  movie: CatalogMovie;
  className?: string;
};

export function MovieCard({ movie, className }: MovieCardProps) {
  const displayRating = formatAudienceRating(movie.vote_average);

  return (
    <MovieDetailButton movie={movie} className={className}>
      <PosterBlock movie={movie} />
      <div className="px-1 pt-2">
        <p className="truncate text-sm font-medium text-text">{movie.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          {movie.release_year !== null ? (
            <>
              <span>{movie.release_year}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span
            aria-label={
              movie.vote_average === null
                ? "No audience rating"
                : `Audience rating ${displayRating.replace("/10", "")} out of 10`
            }
            className="text-rating"
          >
            {displayRating}
          </span>
        </div>
      </div>
    </MovieDetailButton>
  );
}
