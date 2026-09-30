import Link from "next/link";
import { MovieRow } from "@/components/movie/MovieRow";
import { PageContainer } from "@/components/layout/PageContainer";
import { placeholderMovies } from "@/lib/placeholder-data";

const GENRE_ROWS = ["Sci-Fi", "Drama", "Comedy"];

export default function HomePage() {
  const trending = placeholderMovies.slice(0, 10);
  const newReleases = [...placeholderMovies]
    .sort((a, b) => b.release_year - a.release_year)
    .slice(0, 10);
  const topRated = [...placeholderMovies]
    .sort((a, b) => b.vote_average - a.vote_average)
    .slice(0, 10);
  const genreRows = GENRE_ROWS.map((genre) => ({
    genre,
    movies: placeholderMovies.filter((m) => m.genres.includes(genre)),
  }));

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
        <MovieRow title="Trending Now" movies={trending} />
        <MovieRow title="New Releases" movies={newReleases} />
        <MovieRow title="Top Rated" movies={topRated} />
        {genreRows.map((row) => (
          <MovieRow key={row.genre} title={row.genre} movies={row.movies} />
        ))}
      </PageContainer>
    </main>
  );
}
