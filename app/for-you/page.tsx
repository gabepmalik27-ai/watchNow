import { redirect } from "next/navigation";
import { getForYouRecommendations } from "@/lib/recommendations";
import { ForYouClient } from "./for-you-client";

// Per-user and computed on every request; reads the session cookie.
export default async function ForYouPage() {
  const recommendations = await getForYouRecommendations();
  if (!recommendations) redirect("/login?next=%2Ffor-you");
  return <ForYouClient recommendations={recommendations.results} />;
}
