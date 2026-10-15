import { cx } from "@/lib/cx";

type ChartTooltipProps = {
  value: string;
  label: string;
  detail: string;
  /**
   * Distance in px from the mark's bottom edge to the tooltip's bottom edge.
   * Omitted: the tooltip sits just above the whole mark.
   */
  bottom?: number;
  /** Horizontal anchor, so tooltips on edge marks stay inside the chart. */
  align?: "start" | "center" | "end";
};

/**
 * Value first and strong, then the category and detail in muted text. Purely
 * visual (aria-hidden): the mark's aria-label and the table view carry the same text.
 */
export function ChartTooltip({ value, label, detail, bottom, align = "center" }: ChartTooltipProps) {
  return (
    <span
      aria-hidden="true"
      style={bottom === undefined ? undefined : { bottom }}
      className={cx(
        "pointer-events-none absolute z-10 flex flex-col whitespace-nowrap rounded-lg border border-border bg-raised px-2 py-1 text-xs",
        bottom === undefined && "bottom-full mb-2",
        align === "start" && "left-0",
        align === "center" && "left-1/2 -translate-x-1/2",
        align === "end" && "right-0",
      )}
    >
      <span className="font-semibold text-text">{value}</span>
      <span className="text-muted">
        {label} · {detail}
      </span>
    </span>
  );
}
