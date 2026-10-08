import Image from "next/image";
import { PageContainer } from "@/components/layout/PageContainer";

/** TMDB attribution, required by TMDB's API terms on every page. */
export function Footer() {
  return (
    <footer className="mt-8 border-t border-border">
      <PageContainer className="flex flex-col items-start gap-2 py-8 tablet:flex-row tablet:items-center tablet:gap-4">
        <a
          href="https://www.themoviedb.org"
          className="inline-flex min-h-11 items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-midnight"
        >
          <Image src="/tmdb-logo.svg" alt="TMDB" width={123} height={16} />
        </a>
        <p className="text-xs text-muted">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </PageContainer>
    </footer>
  );
}
