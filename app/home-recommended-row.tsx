"use client";

import { useEffect, useState } from "react";
import { MovieRow } from "@/components/movie/MovieRow";
import { MovieRowSkeleton } from "@/components/movie/MovieRowSkeleton";
import { RecommendationCard } from "@/components/movie/RecommendationCard";
import { PersonalizePrompt } from "@/components/ui/PersonalizePrompt";
import { useAuth } from "@/lib/auth";
import type { RecommendationResponse } from "@/lib/recommender";

type RowState =
  | { status: "loading" }
  | { status: "ready"; data: RecommendationResponse }
  | { status: "error" };

/**
 * "Recommended for you" at the top of Home, for signed-in users only. Home
 * itself stays static (ISR); this row fetches the user's list on the client.
 */
export function HomeRecommendedRow() {
  const { status, user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<RowState>({ status: "loading" });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState({ status: "loading" });
    fetch("/api/recommend")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as RecommendationResponse;
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (status !== "signed-in") return null;
  if (state.status === "loading") return <MovieRowSkeleton />;
  // The rest of Home still works; a failed or empty row just stays hidden.
  if (state.status === "error" || state.data.results.length === 0) return null;

  const reasons = new Map(state.data.results.map((r) => [r.movie.id, r.reason]));
  return (
    <div className="flex flex-col gap-4">
      <PersonalizePrompt ratedCount={state.data.ratedCount} />
      <MovieRow
        title="Recommended for you"
        movies={state.data.results.map((r) => r.movie)}
        renderItem={(movie) => <RecommendationCard movie={movie} reason={reasons.get(movie.id) ?? ""} />}
      />
    </div>
  );
}
