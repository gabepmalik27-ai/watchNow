import { NextResponse, type NextRequest } from "next/server";
import {
  getContextRecommendations,
  getForYouRecommendations,
} from "@/lib/recommendations";
import type { RecommendContext } from "@/lib/recommender";
import {
  DISCOVERY_MAX,
  DISCOVERY_MIN,
  EXPERIENCES,
  MOODS,
  TIMES,
} from "@/lib/recommender/constants";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** GET /api/recommend → the signed-in user's For You list (Home row). */
export async function GET() {
  try {
    const result = await getForYouRecommendations();
    if (!result) return unauthorized();
    return NextResponse.json(result, { headers: NO_STORE });
  } catch {
    return serverError();
  }
}

/** POST /api/recommend { mood, experience, time, discovery } → 5 results for the Recommend page. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON");
  }
  const context = parseContext(body);
  if (!context) {
    return badRequest(
      `Expected { mood: ${MOODS.join("|")}|null, experience: ${EXPERIENCES.join("|")}|null, time: ${TIMES.join("|")}|null, discovery: ${DISCOVERY_MIN}–${DISCOVERY_MAX} }`,
    );
  }
  try {
    const result = await getContextRecommendations(context);
    if (!result) return unauthorized();
    return NextResponse.json(result, { headers: NO_STORE });
  } catch {
    return serverError();
  }
}

function oneOf<T extends string>(options: readonly T[], value: unknown): T | null | undefined {
  if (value === null || value === undefined) return null;
  return options.find((option) => option === value);
}

function parseContext(body: unknown): RecommendContext | null {
  if (typeof body !== "object" || body === null) return null;
  const input = body as Record<string, unknown>;
  const mood = oneOf(MOODS, input.mood);
  const experience = oneOf(EXPERIENCES, input.experience);
  const time = oneOf(TIMES, input.time);
  const discovery = input.discovery;
  if (mood === undefined || experience === undefined || time === undefined) return null;
  if (
    typeof discovery !== "number" ||
    !Number.isFinite(discovery) ||
    discovery < DISCOVERY_MIN ||
    discovery > DISCOVERY_MAX
  ) {
    return null;
  }
  return { mood, experience, time, discovery };
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: NO_STORE });
}

function unauthorized() {
  return NextResponse.json({ error: "Sign in to get recommendations" }, { status: 401, headers: NO_STORE });
}

function serverError() {
  return NextResponse.json({ error: "Recommendations are unavailable" }, { status: 500, headers: NO_STORE });
}
