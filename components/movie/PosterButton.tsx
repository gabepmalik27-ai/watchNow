import { PosterBlock } from "@/components/movie/PosterBlock";
import { cx } from "@/lib/cx";
import type { CatalogMovie, UserMovie } from "@/types/movie";

type PosterButtonProps = {
  movie: CatalogMovie;
  userMovie?: UserMovie;
  onOpen: (movie: CatalogMovie, trigger: HTMLButtonElement) => void;
  className?: string;
};

export function PosterButton({ movie, userMovie, onOpen, className }: PosterButtonProps) {
  const rating = userMovie?.rating ?? null;
  const watched = userMovie?.watched ?? false;

  return (
    <button
      type="button"
      onClick={(event) => onOpen(movie, event.currentTarget)}
      className={cx(
        "group w-full rounded-xl text-left transition-colors hover:bg-raised",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight",
        className,
      )}
    >
      <div className="relative">
        <PosterBlock movieId={movie.id} />
        {rating !== null ? (
          <span className="absolute right-2 top-2 rounded-full bg-midnight/80 px-2 py-0.5 text-xs font-semibold text-text">
            <span className="text-rating" aria-hidden="true">
              ★
            </span>{" "}
            {rating.toFixed(1)}
            <span className="sr-only"> — you rated this {rating.toFixed(1)} out of 5</span>
          </span>
        ) : watched ? (
          <span className="absolute right-2 top-2 rounded-full bg-midnight/80 px-2 py-0.5 text-xs font-semibold text-text">
            Watched
          </span>
        ) : null}
      </div>
      <div className="px-1 pt-2">
        <p className="truncate text-sm font-medium text-text">{movie.title}</p>
        <p className="mt-0.5 text-xs text-muted">{movie.release_year}</p>
      </div>
    </button>
  );
}
