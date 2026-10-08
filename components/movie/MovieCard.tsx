import { PosterBlock } from "@/components/movie/PosterBlock";
import { cx } from "@/lib/cx";
import { formatAudienceRating } from "@/lib/format";
import type { CatalogMovie } from "@/types/movie";

type MovieCardProps = {
  movie: CatalogMovie;
  className?: string;
};

export function MovieCard({ movie, className }: MovieCardProps) {
  const displayRating = formatAudienceRating(movie.vote_average);

  return (
    <button
      type="button"
      onClick={() => {
        // TODO: open detail view
      }}
      className={cx(
        "group w-full rounded-xl text-left transition-colors",
        "hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight",
        className,
      )}
    >
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
          <span className="text-rating" aria-hidden="true">
            ★
          </span>
          <span
            aria-label={
              movie.vote_average === null
                ? "No audience rating"
                : `Rated ${displayRating} out of 5`
            }
          >
            {displayRating}
          </span>
        </div>
      </div>
    </button>
  );
}
