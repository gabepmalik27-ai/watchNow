"use client";

import { useState } from "react";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatAudienceRating } from "@/lib/format";
import { getRateCandidates } from "@/lib/rate-candidates";
import { useUserState } from "@/lib/user-state";
import type { CatalogMovie } from "@/types/movie";

const MOOD = ["Funny", "Exciting", "Relaxing"];
const WATCHING_WITH = ["Solo", "Partner", "Friends"];
const TIME = ["<90", "90–120", "2+ hours"];
const EXPERIENCE = ["Easy", "Engaging", "Intense"];

// No scoring logic yet: results are the first five movies from the pool
// the user hasn't watched, dismissed, or watchlisted.
const RESULT_COUNT = 5;

type FilterGroupProps = {
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
};

function FilterGroup({ label, options, value, onChange }: FilterGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <FilterChip
            key={option}
            label={option}
            selected={value === option}
            onClick={() => onChange(value === option ? null : option)}
          />
        ))}
      </div>
    </div>
  );
}

type RecommendClientProps = {
  /** Most-voted movies from getCandidatePool on the server. */
  pool: CatalogMovie[];
};

export function RecommendClient({ pool }: RecommendClientProps) {
  const { userMovies } = useUserState();
  const [mood, setMood] = useState<string | null>(null);
  const [watchingWith, setWatchingWith] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [experience, setExperience] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState(50);
  const [status, setStatus] = useState<"incomplete" | "loading" | "results">(
    "incomplete",
  );

  const results = getRateCandidates(pool, userMovies).slice(0, RESULT_COUNT);

  function handleGetRecommendations() {
    setStatus("loading");
    setTimeout(() => setStatus("results"), 700);
  }

  return (
    <main className="pb-16 pt-8">
      <PageContainer className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-text">
            Find a Movie for Tonight
          </h1>
          <p className="text-muted">Choose the mood and context for right now.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 tablet:grid-cols-2 desktop:grid-cols-4">
          <FilterGroup label="Mood" options={MOOD} value={mood} onChange={setMood} />
          <FilterGroup
            label="Watching with"
            options={WATCHING_WITH}
            value={watchingWith}
            onChange={setWatchingWith}
          />
          <FilterGroup label="Time" options={TIME} value={time} onChange={setTime} />
          <FilterGroup
            label="Experience"
            options={EXPERIENCE}
            value={experience}
            onChange={setExperience}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-muted">Discovery</p>
          <input
            type="range"
            min={0}
            max={100}
            value={discovery}
            onChange={(event) => setDiscovery(Number(event.target.value))}
            aria-label="Discovery: Safe Pick to Surprise Me"
            className="h-2 w-full max-w-xl accent-electric"
          />
          <div className="flex w-full max-w-xl justify-between text-xs text-muted">
            <span>Safe Pick</span>
            <span>Surprise Me</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGetRecommendations}
          className="min-h-11 w-fit rounded-full bg-electric px-6 text-sm font-semibold text-text transition-colors hover:bg-soft-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight"
        >
          Get My Recommendations →
        </button>

        {status === "incomplete" ? (
          <EmptyState
            title="Ready when you are"
            description="Pick a few filters above, or just tap the button — we'll choose five for you."
          />
        ) : status === "loading" ? (
          <div className="grid grid-cols-2 gap-6 tablet:grid-cols-3 desktop:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="aspect-[2/3] w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-text">
              Your Recommendations
            </h2>
            <div className="grid grid-cols-2 gap-6 tablet:grid-cols-3 desktop:grid-cols-5">
              {results.map((movie) => (
                <div key={movie.id} className="flex flex-col gap-2">
                  <PosterBlock movie={movie} />
                  <p className="text-sm font-medium text-text">{movie.title}</p>
                  <p className="text-xs text-muted">
                    {movie.release_year !== null ? `${movie.release_year} · ` : null}
                    <span className="text-rating">★</span>{" "}
                    {formatAudienceRating(movie.vote_average)}
                  </p>
                  {movie.overview ? (
                    <p className="line-clamp-4 text-xs text-muted">{movie.overview}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        )}
      </PageContainer>
    </main>
  );
}
