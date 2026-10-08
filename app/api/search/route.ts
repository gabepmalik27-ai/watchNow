import { NextResponse, type NextRequest } from "next/server";
import { searchMovies } from "@/lib/catalog";

const MAX_QUERY_LENGTH = 100;
const MAX_GENRE_LENGTH = 50;

/** GET /api/search?q=godfather&genre=Drama → up to 40 CatalogMovie, most-voted first. */
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
    const movies = await searchMovies(q, genre || undefined);
    return NextResponse.json(movies, {
      headers: { "Cache-Control": "public, s-maxage=3600" },
    });
  } catch {
    return NextResponse.json({ error: "Catalog unavailable" }, { status: 500 });
  }
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
