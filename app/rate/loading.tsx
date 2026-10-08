import { PageContainer } from "@/components/layout/PageContainer";
import { MovieRowSkeleton } from "@/components/movie/MovieRowSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

export default function RateLoading() {
  return (
    <main className="pb-16 pt-8" aria-busy="true">
      <span className="sr-only" role="status">
        Loading movies to rate…
      </span>
      <PageContainer className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="mt-2 h-12 w-full max-w-2xl rounded-full" />
        </div>
        <MovieRowSkeleton />
        <MovieRowSkeleton />
      </PageContainer>
    </main>
  );
}
