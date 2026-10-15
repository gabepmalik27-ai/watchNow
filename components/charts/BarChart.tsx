"use client";

import { ChartTooltip } from "@/components/charts/ChartTooltip";
import type { ChartDatum } from "@/components/charts/types";
import { useRovingMarks } from "@/components/charts/use-roving-marks";
import { cx } from "@/lib/cx";

type BarChartProps = {
  /** Accessible name of the list of bars, e.g. "Top genres by average rating". */
  label: string;
  /** One-sentence text alternative read before the bars. */
  summary: string;
  data: readonly ChartDatum[];
  /** Value that fills the whole track (5 for ratings, the largest count for counts). */
  max: number;
};

/**
 * Horizontal bars, one series: category label, a 16px bar with a 4px rounded
 * end growing from a shared baseline, value at the tip.
 */
export function BarChart({ label, summary, data, max }: BarChartProps) {
  const { activeIndex, markProps } = useRovingMarks(data.length);

  return (
    // A container, so the layout follows the panel's width, not the viewport's.
    <figure className="@container m-0">
      <figcaption className="sr-only">{summary}</figcaption>
      <ul aria-label={label} className="flex flex-col">
        {data.map((d, index) => {
          const active = activeIndex === index;
          const width = max > 0 ? Math.max(0, Math.min(1, d.value / max)) * 100 : 0;
          return (
            <li
              key={d.key}
              {...markProps(index)}
              aria-label={`${d.label}: ${d.valueText}, ${d.detail}`}
              // Narrow panels (tablet's three-up row): label above the bar.
              // From 288px wide: label beside the bar.
              className="relative grid min-h-11 grid-cols-1 content-center items-center gap-1 rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric @2xs:grid-cols-[128px_1fr] @2xs:gap-2 @2xs:py-0"
            >
              <span aria-hidden="true" className="truncate text-sm text-text" title={d.label}>
                {d.label}
              </span>
              {/* pr-12 keeps room for the value label when the bar is full width. */}
              <span aria-hidden="true" className="flex items-center gap-2 pr-12">
                <span
                  className={cx(
                    "h-4 shrink-0 rounded-r transition-colors",
                    active ? "bg-soft-blue" : "bg-electric",
                  )}
                  style={{ width: `${width}%` }}
                />
                <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted">{d.valueText}</span>
              </span>
              {active ? (
                <ChartTooltip value={d.valueText} label={d.label} detail={d.detail} align="start" />
              ) : null}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
