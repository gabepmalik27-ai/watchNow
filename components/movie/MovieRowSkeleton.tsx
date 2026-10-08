import { Skeleton } from "@/components/ui/Skeleton";

type MovieRowSkeletonProps = {
  /** Number of placeholder cards. */
  count?: number;
};

/** Loading stand-in shaped like MovieRow: a heading and a strip of poster cards. */
export function MovieRowSkeleton({ count = 7 }: MovieRowSkeletonProps) {
  return (
    <div className="flex w-full flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-6 w-40" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex w-36 shrink-0 flex-col gap-2 sm:w-40">
            <Skeleton className="aspect-[2/3] w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
