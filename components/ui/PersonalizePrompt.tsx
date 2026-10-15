import Link from "next/link";
import { PERSONALIZE_PROMPT_RATINGS } from "@/lib/recommender/constants";

type PersonalizePromptProps = {
  ratedCount: number;
};

/** Shown until the user has rated PERSONALIZE_PROMPT_RATINGS movies. */
export function PersonalizePrompt({ ratedCount }: PersonalizePromptProps) {
  const remaining = PERSONALIZE_PROMPT_RATINGS - ratedCount;
  if (remaining <= 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-panel px-6 py-4 tablet:flex-row tablet:items-center tablet:justify-between">
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-text">
          Rate {remaining} more {remaining === 1 ? "movie" : "movies"} to personalize your picks
        </p>
        <p className="text-sm text-muted">
          Until then, these are popular, highly rated movies. Every rating sharpens your recommendations.
        </p>
      </div>
      <Link
        href="/rate"
        className="inline-flex min-h-11 w-fit shrink-0 items-center rounded-full bg-electric px-5 text-sm font-semibold text-text transition-colors hover:bg-soft-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
      >
        Start Rating
      </Link>
    </div>
  );
}
