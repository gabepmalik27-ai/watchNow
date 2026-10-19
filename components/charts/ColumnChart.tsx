"use client";

import { ChartTooltip } from "@/components/charts/ChartTooltip";
import type { ChartDatum } from "@/components/charts/types";
import { useRovingMarks } from "@/components/charts/use-roving-marks";
import { cx } from "@/lib/cx";

/** Tallest column in px; the plot is 192px so the peak's label fits above it. */
const PLOT_HEIGHT = 168;
/** Space between columns in px (Tailwind gap-1); the marker math depends on it. */
const COLUMN_GAP = 4;

/** A vertical reference line through the plot, with its label under the ticks. */
export type ColumnMarker = {
  /** Fractional column index: 0 = center of the first column, 5.5 = between the 6th and 7th. */
  position: number;
  label: string;
  /** dashed = a fixed reference; solid = the user's own value. Text carries the meaning too. */
  kind: "dashed" | "solid";
};

type ColumnChartProps = {
  label: string;
  summary: string;
  data: readonly ChartDatum[];
  /** Text under each column; empty strings leave a slot unlabeled. */
  ticks: readonly string[];
  /** Reference lines; each gets its own label row under the ticks. */
  markers?: readonly ColumnMarker[];
};

/**
 * Vertical columns, one series, from a hairline baseline. Only the tallest
 * column(s) are labeled; every value is in the tooltip and the table view.
 */
export function ColumnChart({ label, summary, data, ticks, markers = [] }: ColumnChartProps) {
  const { activeIndex, markProps } = useRovingMarks(data.length);
  const max = Math.max(0, ...data.map((d) => d.value));
  const n = data.length;
  /** Horizontal offset of a marker position, as a CSS length inside the plot. */
  const markerLeft = (position: number) =>
    `calc((100% - ${(n - 1) * COLUMN_GAP}px) / ${n} * ${position + 0.5} + ${position * COLUMN_GAP}px)`;

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{summary}</figcaption>
      <div className="relative">
        <ul aria-label={label} className="flex h-48 items-end gap-1 border-b border-border">
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
        {markers.map((marker) => (
          <span
            key={marker.label}
            aria-hidden="true"
            className={cx(
              "pointer-events-none absolute inset-y-0 w-0 border-l",
              marker.kind === "dashed" ? "border-dashed border-muted" : "border-solid border-soft-blue",
            )}
            style={{ left: markerLeft(marker.position) }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex gap-1">
        {ticks.map((tick, index) => (
          <span key={index} className="min-w-0 flex-1 text-center text-xs tabular-nums text-muted">
            {tick}
          </span>
        ))}
      </div>
      {markers.map((marker) => (
        <div key={marker.label} aria-hidden="true" className="relative h-5">
          <span
            className={cx(
              "absolute top-1 whitespace-nowrap text-xs",
              marker.kind === "dashed" ? "text-muted" : "text-soft-blue",
              // Keep the label inside the chart near either edge.
              marker.position < 1.5 ? "" : marker.position > n - 2.5 ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{ left: markerLeft(marker.position) }}
          >
            {marker.kind === "dashed" ? "┆ " : "│ "}
            {marker.label}
          </span>
        </div>
      ))}
    </figure>
  );
}
