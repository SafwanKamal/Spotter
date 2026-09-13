import { address } from "@solana/kit";
import type { CompetitionFeed } from "../../../src/lib/competitions";
// Deterministic UI fixtures; no network, local directory or private keys required.
export const competitionFeedFixture: CompetitionFeed = {
  source: "UI test fixture · fictional gyms and athletes",
  fetchedAt: 1789308000000,
  competitions: [
    {
      id: "west-texas-squat-open",
      title: "West Texas Squat Open",
      exercise: "squat" as const,
    },
    {
      id: "weekend-pushup-cup",
      title: "Weekend Push-up Cup",
      exercise: "pushup" as const,
    },
  ].map((c) => ({
    ...c,
    gym: "Demo gym",
    description: "A reviewed demonstration competition.",
    startsAt: 1789300000,
    endsAt: 1789400000,
    targetLamports: "10000000",
    organizer: address("9ceRK5nZAJwxZoqZRgZuvZ3NFmoUeGuGL3HJwkdACCeW"),
    demo: true,
    updatedAt: 1789308000,
    competitors: [
      {
        name: "Demo Alex",
        wallet: address("8V33eoEAE8QQjw7qwUJp9HSvviVt3NKYreKpZn2EbLB1"),
        score: 20,
        reviewed: true,
      },
    ],
    program: null,
    poolAddress: null,
    chain: null,
    chainError: null,
    balance: null,
    termsDigest: "0".repeat(64),
    resultsVerified: null,
  })),
};
