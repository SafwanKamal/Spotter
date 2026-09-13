import type { Metadata } from "next";
import CommunityRankings from "@/components/community-rankings";

export const metadata: Metadata = {
  title: "Community rankings — FormChain",
};

export default async function CommunityRankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ranking?: string }>;
}) {
  const { ranking } = await searchParams;

  return <CommunityRankings ranking={ranking === "trainers" ? "trainers" : "athletes"} />;
}
