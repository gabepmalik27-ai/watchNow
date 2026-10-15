"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart } from "@/components/charts/BarChart";
import { ChartTable } from "@/components/charts/ChartTable";
import { ColumnChart } from "@/components/charts/ColumnChart";
import type { ChartDatum } from "@/components/charts/types";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  TOP_GENRES_MIN_RATINGS,
  genresByWatchCount,
  ratingDistribution,
  topGenresByRating,
} from "@/lib/profile-stats";
import { useMoviesByIds } from "@/lib/use-movies-by-ids";
import type { CatalogMovie, UserMovie } from "@/types/movie";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function ChartPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-text">{title}</h2>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      {children}
    </Panel>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm text-muted">{message}</p>
      <Link
        href="/rate"
        className="inline-flex min-h-11 items-center rounded text-sm font-medium text-soft-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
      >
        Rate movies →
      </Link>
    </div>
  );
}

function ChartLoading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading chart">
      {["w-4/5", "w-2/3", "w-1/2", "w-1/3"].map((width) => (
        <Skeleton key={width} className={`h-4 ${width}`} />
      ))}
    </div>
  );
}

type ForYouChartsProps = {
  userMovies: UserMovie[];
  /** False until the user's saved rows have loaded. */
  loaded: boolean;
  /** Movies the page already has, so their genres needn't be fetched. */
  known: CatalogMovie[];
};

/** The three Overview panels: top genres, most-watched genres, rating distribution. */
export function ForYouCharts({ userMovies, loaded, known }: ForYouChartsProps) {
  const seenIds = userMovies.filter((um) => um.watched || um.rating !== null).map((um) => um.movie_id);
  const { movies, loading, error } = useMoviesByIds(seenIds, known);
  const genresById = new Map(movies.map((m) => [m.id, m.genres]));
  // Genre charts wait for the catalog rows; the histogram only needs ratings.
  const genresPending = !loaded || (loading && movies.length < seenIds.length);

  const topGenres = topGenresByRating(userMovies, genresById);
  const topGenreData: ChartDatum[] = topGenres.map((g) => ({
    key: g.genre,
    label: g.genre,
    value: g.average,
    valueText: `★${g.average.toFixed(1)}`,
    detail: `from ${plural(g.count, "rating", "ratings")}`,
  }));

  const watched = genresByWatchCount(userMovies, genresById);
  const watchedData: ChartDatum[] = watched.map((g) => ({
    key: g.genre,
    label: g.genre,
    value: g.count,
    valueText: String(g.count),
    detail: plural(g.count, "movie", "movies"),
  }));

  const distribution = ratingDistribution(userMovies);
  const ratedTotal = distribution.reduce((sum, b) => sum + b.count, 0);
  const distributionData: ChartDatum[] = distribution.map((b) => ({
    key: String(b.rating),
    label: `${b.rating.toFixed(1)} stars`,
    value: b.count,
    valueText: String(b.count),
    detail: plural(b.count, "movie", "movies"),
  }));
  const mostCommon = distribution.reduce((best, b) => (b.count > best.count ? b : best), distribution[0]);

  const genreError = error && movies.length < seenIds.length;

  return (
    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
      <ChartPanel
        title="Your Top Genres"
        subtitle={`Your average rating per genre (genres with ${TOP_GENRES_MIN_RATINGS}+ ratings)`}
      >
        {genresPending ? (
          <ChartLoading />
        ) : genreError ? (
          <p className="text-sm text-muted">Genres couldn&rsquo;t load right now. Reload to try again.</p>
        ) : topGenreData.length === 0 ? (
          <ChartEmpty
            message={`Rate at least ${TOP_GENRES_MIN_RATINGS} movies in the same genre to see which genres you rate highest.`}
          />
        ) : (
          <>
            <BarChart
              label="Top genres by your average rating, out of 5"
              summary={`Your highest-rated genres: ${topGenres
                .map((g) => `${g.genre} ${g.average.toFixed(1)} stars from ${plural(g.count, "rating", "ratings")}`)
                .join("; ")}.`}
              data={topGenreData}
              max={5}
            />
            <ChartTable caption="Top genres by average rating" categoryHeader="Genre" valueHeader="Average" data={topGenreData} />
          </>
        )}
      </ChartPanel>

      <ChartPanel title="Genres You Watch Most" subtitle="Watched movies per genre; a movie counts once for each of its genres">
        {genresPending ? (
          <ChartLoading />
        ) : genreError ? (
          <p className="text-sm text-muted">Genres couldn&rsquo;t load right now. Reload to try again.</p>
        ) : watchedData.length === 0 ? (
          <ChartEmpty message="Mark movies as watched or rate them to see which genres you watch most." />
        ) : (
          <>
            <BarChart
              label="Watched movies per genre"
              summary={`Genres you watch most: ${watched
                .map((g) => `${g.genre} ${plural(g.count, "movie", "movies")}`)
                .join("; ")}.`}
              data={watchedData}
              max={Math.max(...watched.map((g) => g.count))}
            />
            <ChartTable caption="Watched movies per genre" categoryHeader="Genre" valueHeader="Movies" data={watchedData} />
          </>
        )}
      </ChartPanel>

      <ChartPanel title="Rating Distribution" subtitle="How your ratings spread from 0.5 to 5.0 stars">
        {!loaded ? (
          <ChartLoading />
        ) : ratedTotal === 0 ? (
          <ChartEmpty message="Your ratings will show up here as a spread from 0.5 to 5 stars." />
        ) : (
          <>
            <ColumnChart
              label="Number of movies at each rating, 0.5 to 5 stars"
              summary={`${plural(ratedTotal, "rating", "ratings")}; most common is ${mostCommon.rating.toFixed(1)} stars (${plural(mostCommon.count, "movie", "movies")}). ${distribution
                .filter((b) => b.count > 0)
                .map((b) => `${b.rating.toFixed(1)}: ${b.count}`)
                .join(", ")}.`}
              data={distributionData}
              // Whole stars labeled; half steps stay unlabeled so ten slots don't crowd.
              ticks={distribution.map((b) => (Number.isInteger(b.rating) ? `${b.rating}★` : ""))}
            />
            <ChartTable caption="Number of movies at each rating" categoryHeader="Rating" valueHeader="Movies" data={distributionData} />
          </>
        )}
      </ChartPanel>
    </div>
  );
}
