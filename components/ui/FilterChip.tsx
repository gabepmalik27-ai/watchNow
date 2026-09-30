import { cx } from "@/lib/cx";

type FilterChipProps = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

export function FilterChip({
  label,
  selected = false,
  disabled = false,
  onClick,
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight",
        disabled
          ? "cursor-not-allowed border-border bg-panel text-muted opacity-50"
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
    </button>
  );
}
