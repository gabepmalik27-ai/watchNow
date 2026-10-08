import { getCandidatePool } from "@/lib/catalog";
import { RateClient } from "./rate-client";

export const revalidate = 86400;

export default async function RatePage() {
  const pool = await getCandidatePool(500);
  return <RateClient pool={pool} />;
}
