import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/Skeleton";

export default function RecommendLoading() {
  return (
    <main className="pb-16 pt-8" aria-busy="true">
      <span className="sr-only" role="status">
        Loading recommendations…
      </span>
      <PageContainer className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-1 gap-6 tablet:grid-cols-2 desktop:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-2">
                <Skeleton className="h-11 w-20 rounded-full" />
                <Skeleton className="h-11 w-20 rounded-full" />
                <Skeleton className="h-11 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </PageContainer>
    </main>
  );
}
