import { cx } from "@/lib/cx";

/**
 * Fixed palette standing in for poster art. Deterministic per movie id —
 * intentionally not part of the design token system in globals.css.
 */
const POSTER_PALETTE = [
  "#A9623A", // rust
  "#8C8CB0", // slate purple
  "#A34B49", // brick
  "#D9772E", // orange
  "#5C7A8A", // blue-gray
  "#4F7A63", // sage
  "#B99C6B", // tan
  "#6B5B95", // plum
];

function paletteColorForId(id: number): string {
  const index = Math.abs(id) % POSTER_PALETTE.length;
  return POSTER_PALETTE[index];
}

type PosterBlockProps = {
  movieId: number;
  className?: string;
};

export function PosterBlock({ movieId, className }: PosterBlockProps) {
  return (
    <div
      aria-hidden="true"
      className={cx("aspect-[2/3] w-full rounded-xl", className)}
      style={{ backgroundColor: paletteColorForId(movieId) }}
    />
  );
}
