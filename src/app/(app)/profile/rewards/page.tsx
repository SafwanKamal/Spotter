import type { Metadata } from "next";
import RewardsWorkspace from "@/components/rewards-workspace";

export const metadata: Metadata = { title: "Your rewards — Spotter" };

export default function ProfileRewardsPage() {
  return <RewardsWorkspace />;
}
