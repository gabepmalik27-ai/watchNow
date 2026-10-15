import { cx } from "@/lib/cx";

type FilterChipProps = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /**
   * Shown as selected but can't be changed (🔒). Stays focusable, unlike
   * `disabled`, so keyboard and screen-reader users reach the reason in `describedBy`.
   */
  locked?: boolean;
  /** id of the element explaining the chip (e.g. why it's locked). */
  describedBy?: string;
  onClick?: () => void;
};

export function FilterChip({
  label,
  selected = false,
  disabled = false,
  locked = false,
  describedBy,
  onClick,
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={locked || undefined}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={locked ? undefined : onClick}
      className={cx(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight",
        disabled
          ? "cursor-not-allowed border-border bg-panel text-muted opacity-50"
          : locked
            ? "cursor-not-allowed border-electric bg-electric/60 text-text"
            : selected
            ? "border-electric bg-electric text-text"
            : "border-border bg-panel text-muted hover:bg-raised hover:text-text",
      )}
    >
      {selected ? (
        <span aria-hidden="true" className="text-xs">
          ✓
        </span>
      ) : null}
      {label}
      {locked ? (
        <span aria-hidden="true" className="text-xs">
          🔒
        </span>
      ) : null}
    </button>
  );
}
