import { NextResponse, type NextRequest } from "next/server";
import { getMoviesByIds, MAX_IDS_PER_CALL } from "@/lib/catalog";

/** GET /api/movies?ids=1,2,3 → CatalogMovie[] in the order requested. */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("ids");
  if (!raw) return badRequest("Provide ids, e.g. ?ids=27205,157336");

  const parts = raw.split(",");
  if (!parts.every((part) => /^[1-9]\d{0,9}$/.test(part))) {
    return badRequest("ids must be comma-separated positive integers");
  }
  const ids = [...new Set(parts.map(Number))];
  if (ids.length > MAX_IDS_PER_CALL) {
    return badRequest(`At most ${MAX_IDS_PER_CALL} ids per request`);
  }

  try {
    const movies = await getMoviesByIds(ids);
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
