import { cx } from "@/lib/cx";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cx("animate-pulse rounded-lg bg-raised", className)}
    />
  );
}
