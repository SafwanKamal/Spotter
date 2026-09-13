"use client";
import { useState } from "react";
import { Button } from "./ui/button";
export type RewardSession = {
  source: string;
  exercise: string;
  duration: number;
  coverage: number;
  reps: { start: number; end: number }[];
};
export default function RewardClaim({
  analysis,
  onClaimed,
}: {
  analysis: RewardSession;
  onClaimed?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const eligible =
    analysis.source === "live" &&
    analysis.coverage >= 0.75 &&
    (analysis.reps.length > 0 || analysis.exercise === "plank");
  async function claim() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rewards/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysis),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not collect points.");
      setMessage(
        data.alreadyClaimed
          ? "You have already collected points for this session."
          : `${data.awardedPoints} points added to your account.`,
      );
      window.dispatchEvent(new Event("rewards-updated"));
      onClaimed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not collect points.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reward-claim">
      <h3>Session points</h3>
      <p>
        Earn 10 points for a completed set, plus 2 per rep (up to 20 reps). Up
        to 200 points per day, resetting at midnight UTC.
      </p>
      <Button
        variant="primary"
        onClick={claim}
        disabled={!eligible || busy || Boolean(message)}
      >
        {busy
          ? "Collecting…"
          : message
            ? "Points collected"
            : `Collect ${10 + Math.min(analysis.reps.length, 20) * 2} points`}
      </Button>
      {!eligible && (
        <p>
          Record a live camera session with complete repetitions and at least
          75% tracking coverage to collect points. Uploaded clips do not count.
        </p>
      )}
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <p className="proof-note">
        Participation points use your recorded session summary. They have no
        cash value and cannot be exchanged for crypto. Movement scores and votes
        do not affect points.
      </p>
    </div>
  );
}
