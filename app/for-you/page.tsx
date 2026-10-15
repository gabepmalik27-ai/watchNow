import { redirect } from "next/navigation";
import { getForYouRecommendations } from "@/lib/recommendations";
import { ForYouClient } from "./for-you-client";

type ForYouPageProps = {
  searchParams: Promise<{ debug?: string | string[] }>;
};

// Per-user and computed on every request; reads the session cookie.
export default async function ForYouPage({ searchParams }: ForYouPageProps) {
  const [{ debug }, recommendations] = await Promise.all([
    searchParams,
    getForYouRecommendations(),
  ]);
  if (!recommendations) redirect("/login?next=%2Ffor-you");
  return (
    <ForYouClient
      recommendations={recommendations.results}
      debug={debug === "1" ? recommendations : null}
    />
  );
}
