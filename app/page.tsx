import Link from "next/link";
import { MovieRow } from "@/components/movie/MovieRow";
import { PageContainer } from "@/components/layout/PageContainer";
import { getHomeRows } from "@/lib/catalog";
import { HomeRecommendedRow } from "./home-recommended-row";

// Rebuild the page at most once a day; the catalog is reseeded rarely.
export const revalidate = 86400;

export default async function HomePage() {
  const rows = await getHomeRows();

  return (
    <main className="flex flex-col gap-12 pb-16">
      <PageContainer className="pt-6">
        <section className="flex min-h-[45vh] flex-col justify-center gap-6 rounded-2xl border border-border bg-panel px-6 py-10 tablet:px-12 desktop:px-16">
          <p className="text-xs font-bold uppercase tracking-widest text-electric">
            Find What Moves You
          </p>
          <h1 className="text-4xl font-bold text-text tablet:text-5xl">
            Watch Now.
            <br />
            <span className="text-electric">Your Way.</span>
          </h1>
          <p className="max-w-md text-base text-muted">
            Personalized recommendations for every mood, moment, and movie
            lover.
          </p>
          <Link
            href="/recommend"
            className="inline-flex w-fit min-h-11 items-center gap-2 rounded-full bg-electric px-6 text-sm font-semibold text-text transition-colors hover:bg-soft-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            Find a Movie for Tonight →
          </Link>
        </section>
      </PageContainer>

      <PageContainer className="flex flex-col gap-10">
        <HomeRecommendedRow />
        {rows.map((row) => (
          <MovieRow key={row.title} title={row.title} movies={row.movies} />
        ))}
      </PageContainer>
    </main>
  );
}
