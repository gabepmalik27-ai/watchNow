import { getCandidatePool } from "@/lib/catalog";
import { RecommendClient } from "./recommend-client";

export const revalidate = 86400;

export default async function RecommendPage() {
  const pool = await getCandidatePool(500);
  return <RecommendClient pool={pool} />;
}
