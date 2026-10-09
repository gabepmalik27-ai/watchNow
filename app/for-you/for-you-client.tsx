"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MovieRow } from "@/components/movie/MovieRow";
import { RecommendationCard } from "@/components/movie/RecommendationCard";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { PersonalizePrompt } from "@/components/ui/PersonalizePrompt";
import { StarRating } from "@/components/ui/StarRating";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { useAuth } from "@/lib/auth";
import { formatAudienceRating } from "@/lib/format";
import type { RecommendedMovie } from "@/lib/recommender";
import { useMoviesByIds } from "@/lib/use-movies-by-ids";
import { useUserState } from "@/lib/user-state";
import type { UserMovie } from "@/types/movie";

const TABS: TabItem[] = [
  { id: "overview", label: "Overview" },
  { id: "ratings", label: "My Ratings" },
  { id: "watchlist", label: "Watchlist" },
  { id: "preferences", label: "Preferences" },
  { id: "activity", label: "Activity" },
];

const PREFERENCE_PANELS = [
  "Favorite Genres",
  "Runtime",
  "Movie Era",
  "Viewing Style",
  "Typical Context",
  "Discovery",
];

/** How many recently touched movies the Activity tab lists. */
const ACTIVITY_LIMIT = 5;

/** Describes a movie's current state; null when nothing is set (e.g. removed from watchlist). */
function describeActivity(userMovie: UserMovie, title: string): string | null {
  if (userMovie.rating !== null) return `Rated ${title} ★${userMovie.rating.toFixed(1)}`;
  if (userMovie.watched) return `Marked ${title} watched`;
  if (userMovie.on_watchlist) return `Added ${title} to watchlist`;
  if (userMovie.not_interested) return `Marked ${title} not interested`;
  return null;
}

type ForYouClientProps = {
  /** Scored on the server by lib/recommendations.ts, best first. */
  recommendations: RecommendedMovie[];
};

export function ForYouClient({ recommendations }: ForYouClientProps) {
  const router = useRouter();
  const { displayName } = useAuth();
  const {
    userMovies,
    getUserMovie,
    setRating,
    toggleWatchlist,
    watchedCount,
    ratedCount,
    watchlistCount,
    averageRating,
    loaded,
  } = useUserState();
  const [activeTab, setActiveTab] = useState("overview");

  // Drop anything touched since the server scored the list, so a rating made
  // here takes the movie out of the row right away.
  const recommendedRow = recommendations.filter(({ movie }) => {
    const um = getUserMovie(movie.id);
    return !um || (um.rating === null && !um.watched && !um.on_watchlist && !um.not_interested);
  });
  const recommended = recommendations.map((r) => r.movie);
  const reasons = new Map(recommendations.map((r) => [r.movie.id, r.reason]));

  // "–" until the saved rows arrive, so a returning user never sees 0s flash.
  const displayWatched = loaded ? watchedCount : "–";
  const displayRated = loaded ? ratedCount : "–";
  const displayWatchlist = loaded ? watchlistCount : "–";
  const displayAvg = loaded && ratedCount > 0 ? averageRating.toFixed(1) : "–";

  // Most recent first: array order is oldest -> newest touched.
  const ratedUserMovies = userMovies.filter((um) => um.rating !== null).reverse();
  const { movies: ratedCatalog } = useMoviesByIds(
    ratedUserMovies.map((um) => um.movie_id),
    recommended,
  );
  const ratedById = new Map(ratedCatalog.map((movie) => [movie.id, movie]));
  const ratedMovies = ratedUserMovies.flatMap((userMovie) => {
    const movie = ratedById.get(userMovie.movie_id);
    return movie ? [{ userMovie, movie }] : [];
  });

  const { movies: watchlistMovies } = useMoviesByIds(
    userMovies.filter((um) => um.on_watchlist && !um.watched).map((um) => um.movie_id),
    recommended,
  );

  // Most recently touched first.
  const recentUserMovies = userMovies.slice(-ACTIVITY_LIMIT).reverse();
  const { movies: recentCatalog } = useMoviesByIds(
    recentUserMovies.map((um) => um.movie_id),
    recommended,
  );
  const recentById = new Map(recentCatalog.map((movie) => [movie.id, movie]));
  const recentActivity = recentUserMovies.flatMap((userMovie) => {
    const movie = recentById.get(userMovie.movie_id);
    const text = movie ? describeActivity(userMovie, movie.title) : null;
    return text ? [{ id: userMovie.movie_id, text }] : [];
  });

  return (
    <main className="pb-16 pt-8">
      <PageContainer className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text">
            {displayName ? `Good evening, ${displayName}` : "Good evening"}
          </h1>
          <p className="text-muted">
            Here&rsquo;s a look at your movie journey and what&rsquo;s next.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 tablet:grid-cols-4">
          <StatCard value={displayWatched} label="Watched" />
          <StatCard value={displayRated} label="Rated" />
          <StatCard value={displayAvg} label="Avg rating" />
          <StatCard value={displayWatchlist} label="Watchlist" />
        </div>

        <Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />

        {activeTab === "overview" ? (
          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
              <Panel>
                <p className="font-semibold text-text">Your Top Genres</p>
                <p className="mt-2 text-sm text-muted">
                  Chart coming later — this panel will rank genres by your
                  average rating.
                </p>
              </Panel>
              <Panel>
                <p className="font-semibold text-text">Genres You Watch Most</p>
                <p className="mt-2 text-sm text-muted">
                  Chart coming later — this panel will rank genres by volume
                  watched.
                </p>
              </Panel>
              <Panel>
                <p className="font-semibold text-text">Rating Distribution</p>
                <p className="mt-2 text-sm text-muted">
                  Chart coming later — this panel will show how your ratings
                  spread from 0.5 to 5.0.
                </p>
              </Panel>
            </div>
            {loaded ? <PersonalizePrompt ratedCount={ratedCount} /> : null}
            {recommendedRow.length === 0 ? (
              <EmptyState
                title="You've seen everything we'd suggest"
                description="Rate or dismiss a few more movies and we'll find new picks."
              />
            ) : (
              <MovieRow
                title="Recommended for You"
                movies={recommendedRow.map((r) => r.movie)}
                renderItem={(movie) => (
                  <RecommendationCard movie={movie} reason={reasons.get(movie.id) ?? ""} />
                )}
              />
            )}
          </div>
        ) : null}

        {activeTab === "ratings" ? (
          ratedMovies.length === 0 ? (
            <EmptyState
              title="You haven't rated any movies yet"
              description="Rate a few familiar titles and they'll show up here, most recent first."
              actionLabel="Start Rating"
              onAction={() => router.push("/rate")}
            />
          ) : (
            <div className="grid grid-cols-2 gap-6 tablet:grid-cols-3 desktop:grid-cols-5">
              {ratedMovies.map(({ movie, userMovie }) => (
                <div key={movie.id} className="flex flex-col gap-2">
                  <PosterBlock movie={movie} />
                  <p className="truncate text-sm font-medium text-text">
                    {movie.title}
                  </p>
                  {movie.release_year !== null ? (
                    <p className="text-xs text-muted">{movie.release_year}</p>
                  ) : null}
                  <StarRating
                    value={userMovie.rating}
                    onChange={(value) => setRating(movie.id, value)}
                    label={`Rate ${movie.title}`}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          )
        ) : null}

        {activeTab === "watchlist" ? (
          watchlistMovies.length === 0 ? (
            <EmptyState
              title="Your watchlist is empty"
              description="Movies you want to watch later will show up here."
              actionLabel="Browse Home"
              onAction={() => router.push("/")}
            />
          ) : (
            <div className="grid grid-cols-2 gap-6 tablet:grid-cols-3 desktop:grid-cols-5">
              {watchlistMovies.map((movie) => (
                <div key={movie.id} className="group relative flex flex-col gap-2">
                  <PosterBlock movie={movie} />
                  <button
                    type="button"
                    aria-label={`Remove ${movie.title} from watchlist`}
                    onClick={() => toggleWatchlist(movie.id)}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-midnight/80 text-text opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    ×
                  </button>
                  <p className="truncate text-sm font-medium text-text">
                    {movie.title}
                  </p>
                  <p className="text-xs text-muted">
                    {movie.release_year !== null ? `${movie.release_year} · ` : null}
                    <span className="text-rating">★</span>{" "}
                    {formatAudienceRating(movie.vote_average)}
                  </p>
                </div>
              ))}
            </div>
          )
        ) : null}

        {activeTab === "preferences" ? (
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
            {PREFERENCE_PANELS.map((label) => (
              <Panel key={label}>
                <p className="font-semibold text-text">{label}</p>
                <p className="mt-2 text-sm text-muted">
                  Selected controls and saved user preferences appear here.
                </p>
              </Panel>
            ))}
          </div>
        ) : null}

        {activeTab === "activity" ? (
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-[2fr_1fr]">
            <Panel>
              <p className="mb-3 font-semibold text-text">Recent Activity</p>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted">
                  {loaded
                    ? "No activity yet. Ratings, watched movies and watchlist adds will show up here."
                    : "Loading your activity…"}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {recentActivity.map((entry, index) => (
                    <li
                      key={entry.id}
                      className={
                        index > 0 ? "border-t border-border py-3 text-sm text-text" : "py-3 text-sm text-text"
                      }
                    >
                      {entry.text}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel>
              <p className="mb-2 font-semibold text-text">Your Journey</p>
              <p className="text-sm text-muted">
                {displayRated} rated · {displayWatched} watched
              </p>
            </Panel>
          </div>
        ) : null}
      </PageContainer>
    </main>
  );
}
