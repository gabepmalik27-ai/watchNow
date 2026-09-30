"use client";

import { useRef } from "react";
import { cx } from "@/lib/cx";

const MAX_STARS = 5;
const STEP = 0.5;

function clampToStep(raw: number): number {
  const clamped = Math.min(MAX_STARS, Math.max(STEP, raw));
  return Math.round(clamped / STEP) * STEP;
}

function StarGlyphs({ className }: { className?: string }) {
  return (
    <span className={cx("flex gap-0.5 text-lg leading-none", className)} aria-hidden="true">
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <span key={i}>★</span>
      ))}
    </span>
  );
}

type StarRatingProps =
  | {
      value: number | null;
      onChange?: undefined;
      label?: string;
      size?: "sm" | "md";
    }
  | {
      value: number | null;
      onChange: (value: number) => void;
      label?: string;
      size?: "sm" | "md";
    };

export function StarRating({ value, onChange, label, size = "md" }: StarRatingProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactive = typeof onChange === "function";
  const fillPercent = value ? (value / MAX_STARS) * 100 : 0;
  const textSize = size === "sm" ? "text-sm" : "text-lg";

  function valueFromPointer(clientX: number): number {
    const el = containerRef.current;
    if (!el) return value ?? STEP;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return clampToStep(ratio * MAX_STARS);
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!onChange) return;
    onChange(valueFromPointer(event.clientX));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!onChange) return;
    const current = value ?? 0;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(clampToStep(current + STEP));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(clampToStep(current - STEP || STEP));
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(STEP);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(MAX_STARS);
    }
  }

  const ariaLabel = interactive
    ? (label ?? "Rating")
    : (label ?? (value ? `Rated ${value} out of 5` : "Not rated"));

  return (
    <div
      ref={containerRef}
      role={interactive ? "slider" : "img"}
      aria-label={ariaLabel}
      aria-valuemin={interactive ? STEP : undefined}
      aria-valuemax={interactive ? MAX_STARS : undefined}
      aria-valuenow={interactive ? (value ?? 0) : undefined}
      aria-valuetext={
        interactive
          ? value
            ? `${value} out of 5 stars`
            : "Not rated"
          : undefined
      }
      tabIndex={interactive ? 0 : -1}
      onClick={interactive ? handleClick : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      className={cx(
        "relative inline-block w-fit shrink-0 self-start select-none",
        interactive &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight rounded",
      )}
    >
      <StarGlyphs className={cx(textSize, "text-border")} />
      <div
        className="absolute inset-0 overflow-hidden whitespace-nowrap"
        style={{ width: `${fillPercent}%` }}
      >
        <StarGlyphs className={cx(textSize, "text-rating")} />
      </div>
    </div>
  );
}
