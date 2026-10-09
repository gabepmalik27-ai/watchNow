import { RecommendClient } from "./recommend-client";

type RecommendPageProps = {
  searchParams: Promise<{ debug?: string | string[] }>;
};

export default async function RecommendPage({ searchParams }: RecommendPageProps) {
  const { debug } = await searchParams;
  return <RecommendClient debug={debug === "1"} />;
}
