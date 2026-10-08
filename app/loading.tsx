import { PageContainer } from "@/components/layout/PageContainer";
import { MovieRowSkeleton } from "@/components/movie/MovieRowSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

export default function HomeLoading() {
  return (
    <main className="flex flex-col gap-12 pb-16" aria-busy="true">
      <span className="sr-only" role="status">
        Loading movies…
      </span>
      <PageContainer className="pt-6">
        <Skeleton className="min-h-[45vh] w-full rounded-2xl" />
      </PageContainer>
      <PageContainer className="flex flex-col gap-10">
        <MovieRowSkeleton />
        <MovieRowSkeleton />
        <MovieRowSkeleton />
      </PageContainer>
    </main>
  );
}
