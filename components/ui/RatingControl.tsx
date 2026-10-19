"use client";

import { useRef } from "react";
import { cx } from "@/lib/cx";
import {
  RATING_AVERAGE_ANCHOR,
  RATING_MAX,
  RATING_MIN,
  RATING_VALUES,
  formatUserRating,
  ratingLabel,
} from "@/lib/rating-scale";

type RatingControlProps =
  | {
      value: number | null;
      /** Omit for the read-only display. */
      onChange?: undefined;
      label?: string;
    }
  | {
      value: number | null;
      onChange: (value: number) => void;
      label?: string;
    };

/**
 * The 1–10 rating input. A radiogroup of ten buttons: one row from the tablet
 * breakpoint up, two rows of five below it. With no `onChange` it renders the
 * read-only "7/10 · Good" display instead.
 */
export function RatingControl({ value, onChange, label }: RatingControlProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  if (typeof onChange !== "function") {
    if (value === null) return <span className="text-sm text-muted">Not rated</span>;
    return (
      <span
        role="img"
        aria-label={`${label ? `${label}: ` : ""}${value} out of ${RATING_MAX}, ${ratingLabel(value)}`}
        className="text-sm"
      >
        <span aria-hidden="true">
          <span className="font-semibold text-rating">{formatUserRating(value)}</span>
          <span className="text-muted"> · {ratingLabel(value)}</span>
        </span>
      </span>
    );
  }

  function select(next: number) {
    if (!onChange) return;
    onChange(next);
    buttons.current[next - RATING_MIN]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, current: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(RATING_MAX, current + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(RATING_MIN, current - 1);
    else if (event.key === "Home") next = RATING_MIN;
    else if (event.key === "End") next = RATING_MAX;
    if (next === null) return;
    event.preventDefault();
    select(next);
  }

  // Roving tabindex: the selected radio is the tab stop, or the first when unrated.
  const tabStop = value ?? RATING_MIN;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label={label ?? "Your rating"}
        className="grid grid-cols-5 gap-x-2 gap-y-1 tablet:grid-cols-10"
      >
        {RATING_VALUES.map((n) => {
          const selected = value === n;
          return (
            <div key={n} className="flex flex-col items-center gap-1">
              <button
                ref={(el) => {
                  buttons.current[n - RATING_MIN] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${n} out of ${RATING_MAX}, ${ratingLabel(n)}`}
                tabIndex={n === tabStop ? 0 : -1}
                onClick={() => onChange(n)}
                onKeyDown={(event) => handleKeyDown(event, n)}
                className={cx(
                  "inline-flex min-h-11 w-full min-w-11 items-center justify-center gap-1 rounded-xl border text-sm font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                  selected
                    ? "border-electric bg-electric text-text"
                    : "border-border bg-panel text-muted hover:bg-raised hover:text-text",
                )}
              >
                {selected ? (
                  <span aria-hidden="true" className="text-xs">
                    ✓
                  </span>
                ) : null}
                {n}
              </button>
              {n === RATING_AVERAGE_ANCHOR ? (
                <span className="text-xs text-muted">
                  <span aria-hidden="true">▲ </span>average
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-sm text-muted">
        {value === null ? (
          "Select a rating from 1 to 10"
        ) : (
          <>
            <span className="font-semibold text-text">{value}</span> · {ratingLabel(value)}
          </>
        )}
      </p>
    </div>
  );
}
