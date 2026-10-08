import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/Skeleton";

export default function SearchLoading() {
  return (
    <main className="pb-16 pt-8" aria-busy="true">
      <span className="sr-only" role="status">
        Loading search…
      </span>
      <PageContainer className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-12 w-full max-w-2xl rounded-full" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-24 rounded-full" />
          ))}
        </div>
      </PageContainer>
    </main>
  );
}
