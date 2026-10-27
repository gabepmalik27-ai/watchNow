import { NextResponse, type NextRequest } from "next/server";
import { searchMovies } from "@/lib/catalog";
import { importMoviesForQuery, shouldImport } from "@/lib/catalog-admin";

const MAX_QUERY_LENGTH = 100;
const MAX_GENRE_LENGTH = 50;

/**
 * GET /api/search?q=godfather&genre=Drama → up to 40 SearchResult, best match
 * first (see search_catalog in supabase/migrations/0005_search.sql). Each row
 * says why it matched: match_kind, plus match_person for director/cast hits.
 *
 * Import on miss: if q is 3+ characters and the catalog returned nothing, or
 * only typo ("fuzzy") guesses, the film may simply not be in the catalog yet.
 * importMoviesForQuery asks TMDB, saves up to 5 real films permanently, and the
 * search is rerun so they come back in this same response. Any response where
 * an import was attempted (whatever the outcome) is "no-store" and carries
 * x-watchnow-imported: <count>, so a dead end is never cached for an hour.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const genre = (params.get("genre") ?? "").trim();

  if (!q && !genre) return badRequest("Provide q, genre, or both");
  if (q.length > MAX_QUERY_LENGTH) {
    return badRequest(`q must be at most ${MAX_QUERY_LENGTH} characters`);
  }
  if (genre.length > MAX_GENRE_LENGTH) {
    return badRequest(`genre must be at most ${MAX_GENRE_LENGTH} characters`);
  }

  try {
    let movies = await searchMovies(q, genre || undefined);

    if (!shouldImport(q, movies)) {
      return NextResponse.json(movies, {
        headers: { "Cache-Control": "public, s-maxage=3600" },
      });
    }

    const imported = await importMoviesForQuery(q);
    if (imported > 0) movies = await searchMovies(q, genre || undefined);
    return NextResponse.json(movies, {
      headers: { "Cache-Control": "no-store", "x-watchnow-imported": String(imported) },
    });
  } catch {
    return NextResponse.json({ error: "Catalog unavailable" }, { status: 500 });
  }
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
