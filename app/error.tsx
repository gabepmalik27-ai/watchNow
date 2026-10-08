"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";

/** Shown when a page's server data (the Supabase catalog) fails to load. */
export default function CatalogError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="pb-16 pt-8">
      <PageContainer>
        <div role="alert">
          <EmptyState
            title="We couldn't reach the movie catalog"
            description="This is usually a brief connection hiccup. Give it a moment, then try again."
            actionLabel="Try again"
            onAction={reset}
          />
        </div>
      </PageContainer>
    </main>
  );
}
