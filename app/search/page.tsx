import { getGenres } from "@/lib/catalog";
import { SearchClient } from "./search-client";

// Genre list changes only when the catalog is reseeded.
export const revalidate = 86400;

export default async function SearchPage() {
  const genres = await getGenres();
  return <SearchClient genres={genres} />;
}
