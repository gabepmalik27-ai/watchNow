"use client";

import { ChartTooltip } from "@/components/charts/ChartTooltip";
import type { ChartDatum } from "@/components/charts/types";
import { useRovingMarks } from "@/components/charts/use-roving-marks";
import { cx } from "@/lib/cx";

/** Tallest column in px; the plot is 192px so the peak's label fits above it. */
const PLOT_HEIGHT = 168;

type ColumnChartProps = {
  label: string;
  summary: string;
  data: readonly ChartDatum[];
  /** Text under each column; empty strings leave a slot unlabeled. */
  ticks: readonly string[];
};

/**
 * Vertical columns, one series, from a hairline baseline. Only the tallest
 * column(s) are labeled; every value is in the tooltip and the table view.
 */
export function ColumnChart({ label, summary, data, ticks }: ColumnChartProps) {
  const { activeIndex, markProps } = useRovingMarks(data.length);
  const max = Math.max(0, ...data.map((d) => d.value));

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{summary}</figcaption>
      <ul aria-label={label} className="flex h-48 items-end gap-2 border-b border-border">
        {data.map((d, index) => {
          const active = activeIndex === index;
          const height = max > 0 ? (d.value / max) * PLOT_HEIGHT : 0;
          return (
            <li
              key={d.key}
              {...markProps(index)}
              aria-label={`${d.label}: ${d.valueText}, ${d.detail}`}
              className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
            >
              {max > 0 && d.value === max ? (
                <span aria-hidden="true" className="mb-1 text-xs tabular-nums text-muted">
                  {d.valueText}
                </span>
              ) : null}
              <span
                aria-hidden="true"
                className={cx(
                  "w-full max-w-6 rounded-t transition-colors",
                  active ? "bg-soft-blue" : "bg-electric",
                )}
                style={{ height: `${height}px` }}
              />
              {active ? (
                <ChartTooltip
                  value={d.valueText}
                  label={d.label}
                  detail={d.detail}
                  // Just above the bar (and the peak label), not the top of the plot.
                  bottom={height + (max > 0 && d.value === max ? 24 : 8)}
                  align={index < 2 ? "start" : index >= data.length - 2 ? "end" : "center"}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <div aria-hidden="true" className="mt-1 flex gap-2">
        {ticks.map((tick, index) => (
          <span key={index} className="min-w-0 flex-1 text-center text-xs tabular-nums text-muted">
            {tick}
          </span>
        ))}
      </div>
    </figure>
  );
}
