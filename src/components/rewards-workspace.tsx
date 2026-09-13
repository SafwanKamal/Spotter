"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "./ui/card";
import { ButtonLink } from "./ui/button";
import RewardClaim, { type RewardSession } from "./reward-claim";
import RewardLeaderboard from "./reward-leaderboard";
const WalletRewards = dynamic(() => import("./wallet-rewards"), { ssr: false });
export default function RewardsWorkspace() {
  const [session, setSession] = useState<RewardSession | null>(null);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      try {
        const raw = sessionStorage.getItem("formchain.rewardSession.v1");
        if (raw && active) {
          const value = JSON.parse(raw);
          if (
            value &&
            value.source === "live" &&
            Array.isArray(value.reps) &&
            typeof value.coverage === "number" &&
            typeof value.duration === "number"
          )
            setSession(value);
        }
      } catch {}
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="journal workspace-page rewards-page">
      <Link className="profile-back" href="/profile">
        ← Profile
      </Link>
      <header className="page-head">
        <div>
          <h1>Rewards</h1>
          <p>
            Your consistency adds up. Collect session points and see your place
            in the community.
          </p>
        </div>
        <ButtonLink href="/social" variant="quiet">
          Community leaderboard
        </ButtonLink>
      </header>
      <Card variant="profile">
        {session ? (
          <RewardClaim analysis={session} />
        ) : (
          <div className="set-prompt">
            <h2>Your next set starts here</h2>
            <p>
              Finish a live camera set to collect participation points.
              Uploaded clips do not count. Your points stay with your account.
            </p>
            <ButtonLink href="/analyze" variant="primary">
              Open live camera
            </ButtonLink>
          </div>
        )}
      </Card>
      <Card variant="profile">
        <RewardLeaderboard account />
      </Card>
      <Card variant="profile">
        <WalletRewards />
      </Card>
    </div>
  );
}
