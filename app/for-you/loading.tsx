import { PageContainer } from "@/components/layout/PageContainer";
import { MovieRowSkeleton } from "@/components/movie/MovieRowSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

export default function ForYouLoading() {
  return (
    <main className="pb-16 pt-8" aria-busy="true">
      <span className="sr-only" role="status">
        Loading your profile…
      </span>
      <PageContainer className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-2 gap-4 tablet:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
        <MovieRowSkeleton count={8} />
      </PageContainer>
    </main>
  );
}
