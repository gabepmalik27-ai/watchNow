"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MovieRow } from "@/components/movie/MovieRow";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { StarRating } from "@/components/ui/StarRating";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { placeholderMovies, placeholderProfile } from "@/lib/placeholder-data";
import { useUserState } from "@/lib/user-state";

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

/**
 * Static placeholder content — there's no timestamp field on UserMovie, so
 * this is a display fixture, not derived from real interactions.
 */
const RECENT_ACTIVITY = [
  "Rated Dune: Part Two",
  "Added The Batman to watchlist",
  "Rated Poor Things",
  "Marked The Holdovers watched",
];

export default function ForYouPage() {
  const router = useRouter();
  const { userMovies, setRating, watchedCount, ratedCount, averageRating } =
    useUserState();
  const [activeTab, setActiveTab] = useState("overview");
  const [watchlistIds, setWatchlistIds] = useState<number[]>(
    placeholderMovies.slice(0, 6).map((m) => m.id),
  );

  const displayWatched = watchedCount > 0 ? watchedCount : placeholderProfile.watched_count;
  const displayRated = ratedCount > 0 ? ratedCount : placeholderProfile.rated_count;
  const displayAvg =
    ratedCount > 0
      ? averageRating.toFixed(1)
      : placeholderProfile.average_rating.toFixed(1);

  const ratedMovies = userMovies
    .filter((um) => um.rating !== null)
    .slice()
    .reverse()
    .map((um) => ({
      userMovie: um,
      movie: placeholderMovies.find((m) => m.id === um.movie_id),
    }))
    .filter((entry): entry is { userMovie: typeof entry.userMovie; movie: NonNullable<typeof entry.movie> } =>
      Boolean(entry.movie),
    );

  const watchlistMovies = watchlistIds
    .map((id) => placeholderMovies.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  return (
    <main className="pb-16 pt-8">
      <PageContainer className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text">
            Good evening, {placeholderProfile.name}
          </h1>
          <p className="text-muted">
            Here&rsquo;s a look at your movie journey and what&rsquo;s next.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 tablet:grid-cols-4">
          <StatCard value={displayWatched} label="Watched" />
          <StatCard value={displayRated} label="Rated" />
          <StatCard value={displayAvg} label="Avg rating" />
          <StatCard value={placeholderProfile.watchlist_count} label="Watchlist" />
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
            <MovieRow
              title="Recommended for You"
              movies={placeholderMovies.slice(0, 8)}
            />
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
                  <PosterBlock movieId={movie.id} />
                  <p className="truncate text-sm font-medium text-text">
                    {movie.title}
                  </p>
                  <p className="text-xs text-muted">{movie.release_year}</p>
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
                  <PosterBlock movieId={movie.id} />
                  <button
                    type="button"
                    aria-label={`Remove ${movie.title} from watchlist`}
                    onClick={() =>
                      setWatchlistIds((ids) => ids.filter((id) => id !== movie.id))
                    }
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-midnight/80 text-text opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    ×
                  </button>
                  <p className="truncate text-sm font-medium text-text">
                    {movie.title}
                  </p>
                  <p className="text-xs text-muted">
                    {movie.release_year} ·{" "}
                    <span className="text-rating">★</span>{" "}
                    {(movie.vote_average / 2).toFixed(1)}
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
              <ul className="flex flex-col">
                {RECENT_ACTIVITY.map((entry, index) => (
                  <li
                    key={entry}
                    className={
                      index > 0 ? "border-t border-border py-3 text-sm text-text" : "py-3 text-sm text-text"
                    }
                  >
                    {entry}
                  </li>
                ))}
              </ul>
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
