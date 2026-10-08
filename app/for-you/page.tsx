import { getCandidatePool } from "@/lib/catalog";
import { ForYouClient } from "./for-you-client";

export const revalidate = 86400;

export default async function ForYouPage() {
  const recommended = await getCandidatePool(8);
  return <ForYouClient recommended={recommended} />;
}
