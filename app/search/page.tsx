import { Suspense } from "react";
import { getGenres } from "@/lib/catalog";
import { SearchClient } from "./search-client";

// Genre list changes only when the catalog is reseeded.
export const revalidate = 86400;

/** Matches the /api/search cap, so a pasted-in huge ?q can't turn into a 400. */
const MAX_QUERY_LENGTH = 100;

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const initialQuery = (Array.isArray(q) ? q[0] : q)?.slice(0, MAX_QUERY_LENGTH) ?? "";
  const genres = await getGenres();
  return (
    // useSearchParams (in SearchClient) needs a Suspense boundary.
    <Suspense fallback={null}>
      <SearchClient genres={genres} initialQuery={initialQuery} />
    </Suspense>
  );
}
