"use client";

import Link from "next/link";
import RewardLeaderboard from "@/components/reward-leaderboard";
import TrainerLeaderboard from "@/components/trainer-leaderboard";

export default function CommunityRankings({
  ranking,
}: {
  ranking: "athletes" | "trainers";
}) {
  return (
    <div className="journal page-journal community-rankings">
      <Link className="profile-back" href="/social">
        ← Community
      </Link>
      <header className="page-head">
        <div>
          <h1>Community rankings</h1>
          <p>See the people showing up and sharing useful coaching.</p>
        </div>
      </header>
      <nav className="segmented ranking-switcher" aria-label="Ranking type">
        <Link
          href="/social/leaderboard?ranking=athletes"
          aria-current={ranking === "athletes" ? "page" : undefined}
        >
          Athletes
        </Link>
        <Link
          href="/social/leaderboard?ranking=trainers"
          aria-current={ranking === "trainers" ? "page" : undefined}
        >
          Trainers
        </Link>
      </nav>
      {ranking === "athletes" ? (
        <RewardLeaderboard />
      ) : (
        <TrainerLeaderboard />
      )}
    </div>
  );
}
