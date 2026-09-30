"use client";

import { useRef } from "react";
import { MovieCard } from "@/components/movie/MovieCard";
import type { Movie } from "@/types/movie";

type MovieRowProps = {
  title: string;
  movies: Movie[];
  onSeeAll?: () => void;
};

const SCROLL_STEP = 320;

export function MovieRow({ title, movies, onSeeAll }: MovieRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!scrollerRef.current) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollerRef.current.scrollBy({ left: SCROLL_STEP, behavior: "smooth" });
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollerRef.current.scrollBy({ left: -SCROLL_STEP, behavior: "smooth" });
    }
  }

  return (
    <section className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-text">{title}</h2>
        {onSeeAll ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="rounded text-sm font-medium text-soft-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
          >
            See All
          </button>
        ) : null}
      </div>
      <div
        ref={scrollerRef}
        role="group"
        aria-label={`${title} — scrollable`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="scroll-smooth flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight"
      >
        {movies.map((movie) => (
          <div key={movie.id} className="w-36 shrink-0 snap-start sm:w-40">
            <MovieCard movie={movie} />
          </div>
        ))}
      </div>
    </section>
  );
}
