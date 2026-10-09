"use client";

import { useState } from "react";
import { PosterBlock } from "@/components/movie/PosterBlock";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatAudienceRating } from "@/lib/format";
import type { RecommendationResponse, RecommendedMovie, ScoreBreakdown } from "@/lib/recommender";
import {
  DISCOVERY_DEFAULT,
  DISCOVERY_MAX,
  DISCOVERY_MIN,
  EXPERIENCES,
  FEATURES,
  MOODS,
  RECOMMEND_LIMIT,
  TIMES,
  type Experience,
  type Mood,
  type TimeOption,
} from "@/lib/recommender/constants";

type FilterGroupProps<T extends string> = {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (value: T | null) => void;
};

function FilterGroup<T extends string>({ label, options, value, onChange }: FilterGroupProps<T>) {
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

const fmt = (n: number) => n.toFixed(3);

/** Hidden behind ?debug=1: the full score breakdown for one result. */
function BreakdownPanel({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <details className="rounded-xl border border-border bg-panel p-2 text-xs text-muted">
      <summary className="cursor-pointer font-semibold text-text">
        Score {fmt(breakdown.score)}
      </summary>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr>
            <th className="font-semibold">Feature</th>
            <th className="font-semibold">Value</th>
            <th className="font-semibold">Weight</th>
            <th className="font-semibold">Contrib.</th>
          </tr>
        </thead>
        <tbody>
          {FEATURES.map((feature) => (
            <tr key={feature}>
              <td>{feature}</td>
              <td>{fmt(breakdown.features[feature])}</td>
              <td>{fmt(breakdown.weights[feature])}</td>
              <td>{fmt(breakdown.contributions[feature])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2">
        raw kw {fmt(breakdown.raw.keyword)} · genre {fmt(breakdown.raw.genre)} · people{" "}
        {fmt(breakdown.raw.people)}
      </p>
      <p>
        popularity pct {fmt(breakdown.popularityPercentile)} · target {fmt(breakdown.rarityTarget)}
        {breakdown.coldStart ? " · cold start" : ""}
      </p>
    </details>
  );
}

type Status =
  | { kind: "incomplete" }
  | { kind: "loading" }
  | { kind: "results"; results: RecommendedMovie[]; coldStart: boolean }
  | { kind: "error" };

type RecommendClientProps = {
  /** Shows the score breakdown under each result (?debug=1). */
  debug: boolean;
};

export function RecommendClient({ debug }: RecommendClientProps) {
  const [mood, setMood] = useState<Mood | null>(null);
  const [time, setTime] = useState<TimeOption | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [discovery, setDiscovery] = useState(DISCOVERY_DEFAULT);
  const [status, setStatus] = useState<Status>({ kind: "incomplete" });

  async function handleGetRecommendations() {
    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, experience, time, discovery }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RecommendationResponse;
      setStatus({ kind: "results", results: data.results, coldStart: data.coldStart });
    } catch {
      setStatus({ kind: "error" });
    }
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

        <div className="grid grid-cols-1 gap-6 tablet:grid-cols-3">
          <FilterGroup label="Mood" options={MOODS} value={mood} onChange={setMood} />
          <FilterGroup label="Time" options={TIMES} value={time} onChange={setTime} />
          <FilterGroup
            label="Experience"
            options={EXPERIENCES}
            value={experience}
            onChange={setExperience}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-muted">Discovery</p>
          <input
            type="range"
            min={DISCOVERY_MIN}
            max={DISCOVERY_MAX}
            value={discovery}
            onChange={(event) => setDiscovery(Number(event.target.value))}
            aria-label="Discovery: Safe Pick to Surprise Me"
            aria-valuetext={
              discovery <= 33 ? "Safe Pick" : discovery >= 67 ? "Surprise Me" : "Balanced"
            }
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
          disabled={status.kind === "loading"}
          className="min-h-11 w-fit rounded-full bg-electric px-6 text-sm font-semibold text-text transition-colors hover:bg-soft-blue disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight"
        >
          Get My Recommendations →
        </button>

        {status.kind === "incomplete" ? (
          <EmptyState
            title="Ready when you are"
            description={`Pick a few filters above, or just tap the button — we'll choose ${RECOMMEND_LIMIT} for you.`}
          />
        ) : status.kind === "loading" ? (
          <div
            className="grid grid-cols-2 gap-6 tablet:grid-cols-3 desktop:grid-cols-5"
            role="status"
            aria-label="Finding recommendations"
          >
            {Array.from({ length: RECOMMEND_LIMIT }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="aspect-[2/3] w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : status.kind === "error" ? (
          <EmptyState
            title="Recommendations are unavailable right now"
            description="We couldn't reach the recommender. Try again in a moment."
            actionLabel="Try again"
            onAction={handleGetRecommendations}
          />
        ) : status.results.length === 0 ? (
          <EmptyState
            title="Nothing fits that time slot"
            description="No unwatched movies match those filters. Try a different time or clear a filter."
          />
        ) : (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-text">
              Your Recommendations
            </h2>
            <div className="grid grid-cols-2 gap-6 tablet:grid-cols-3 desktop:grid-cols-5">
              {status.results.map(({ movie, reason, breakdown }) => (
                <div key={movie.id} className="flex flex-col gap-2">
                  <PosterBlock movie={movie} />
                  <p className="text-sm font-medium text-text">{movie.title}</p>
                  <p className="text-xs text-muted">
                    {movie.release_year !== null ? `${movie.release_year} · ` : null}
                    {movie.runtime_min !== null ? `${movie.runtime_min} min · ` : null}
                    <span className="text-rating">★</span>{" "}
                    {formatAudienceRating(movie.vote_average)}
                  </p>
                  <p className="text-xs font-medium text-soft-blue">{reason}</p>
                  {movie.overview ? (
                    <p className="line-clamp-4 text-xs text-muted">{movie.overview}</p>
                  ) : null}
                  {debug ? <BreakdownPanel breakdown={breakdown} /> : null}
                </div>
              ))}
            </div>
          </section>
        )}
      </PageContainer>
    </main>
  );
}
