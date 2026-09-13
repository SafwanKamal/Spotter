import {
  generateKeyPair,
  getAddressFromPublicKey,
  signBytes,
} from "@solana/kit";
import { analyzeSquats, demoFrames } from "./analysis";
import {
  calculateReward,
  createRewardRedemptionMessage,
  encodeWalletSignature,
  issueRewardAttestation,
  RewardError,
  RewardLedger,
  type RewardAttestationEnvelope,
} from "./reward-policy";
import {
  createWorkoutClaim,
  createWorkoutMemo,
  hashWorkoutClaim,
} from "./workout-proof";

/** Demo-only HMAC secret so examples run without production reward env vars. */
export const REWARD_DEMO_ATTESTATION_SECRET =
  "spotter-demo-attestation-secret-v1-not-production";

const alexAnalysis = analyzeSquats(demoFrames(), 1000, 1000, 12, "video");

function claimWithReps(
  repetitions: number,
  setDurationMs: number,
  rangeTempoScore: number,
) {
  const reps = Array.from(
    { length: repetitions },
    (_, index) => alexAnalysis.reps[index % alexAnalysis.reps.length]!,
  );
  return createWorkoutClaim({
    ...alexAnalysis,
    reps,
    duration: setDurationMs / 1_000,
    movementScore: rangeTempoScore,
  });
}

export const rewardDemoExamples = [
  {
    id: "alex-three-reps",
    athlete: "Alex",
    summary: "3 complete squat reps from the built-in landmark fixture",
    claim: createWorkoutClaim(alexAnalysis),
    gymVisitMinutes: 0,
  },
  {
    id: "jordan-eight-reps",
    athlete: "Jordan",
    summary: "8 complete squat reps; a higher movement score is ignored",
    claim: claimWithReps(8, 20_000, 99),
    gymVisitMinutes: 0,
  },
  {
    id: "sam-gym-visit",
    athlete: "Sam",
    summary: "5 squat reps plus a 45-minute rotating-QR gym visit",
    claim: claimWithReps(5, 16_000, 40),
    gymVisitMinutes: 45,
  },
] as const;

export type RewardDemoExampleId = (typeof rewardDemoExamples)[number]["id"];

function gymVisitFor(minutes: number, nowMs: number, visitId: string) {
  if (minutes <= 0) return undefined;
  const durationMs = minutes * 60_000;
  return {
    version: "spotter.gym-visit.v1" as const,
    visitId,
    gymId: "hackwestx-demo-gym",
    method: "rotating-gym-qr" as const,
    checkedInAtMs: nowMs - durationMs - 60_000,
    checkedOutAtMs: nowMs - 60_000,
  };
}

export async function describeRewardDemoExamples(nowMs = Date.now()) {
  return Promise.all(
    rewardDemoExamples.map(async (example) => {
      const gymVisit = gymVisitFor(
        example.gymVisitMinutes,
        nowMs,
        "00000000-0000-4000-8000-000000000001",
      );
      const points = calculateReward(example.claim, gymVisit);
      const claimDigest = await hashWorkoutClaim(example.claim);
      return {
        id: example.id,
        athlete: example.athlete,
        summary: example.summary,
        repetitions: example.claim.repetitions,
        setDurationMs: example.claim.setDurationMs,
        rangeTempoScore: example.claim.rangeTempoScore,
        gymVisitMinutes: example.gymVisitMinutes,
        claimDigest,
        memo: createWorkoutMemo(example.claim, claimDigest),
        points,
      };
    }),
  );
}

export type RewardDemoCatalogItem = Awaited<
  ReturnType<typeof describeRewardDemoExamples>
>[number];

export type RewardDemoRunItem = RewardDemoCatalogItem & {
  walletAddress: string;
  attestationId: string;
  awardedPoints: number;
  balance: number;
};

export type RewardDemoExecution = {
  kind: "execution";
  policyVersion: "spotter.rewards.v1";
  storage: "ephemeral-demo";
  examples: RewardDemoRunItem[];
  leaderboard: {
    rank: number;
    athlete: string;
    walletAddress: string;
    balance: number;
  }[];
  replay: {
    rejected: boolean;
    code: string | null;
    message: string;
  };
};

type ExecutedExample = {
  item: RewardDemoRunItem;
  attestation: RewardAttestationEnvelope;
  walletSignature: string;
};

async function redeemExample(
  example: (typeof rewardDemoExamples)[number],
  ledger: RewardLedger,
  secret: string,
  nowMs: number,
): Promise<ExecutedExample> {
  const keyPair = await generateKeyPair();
  const walletAddress = await getAddressFromPublicKey(keyPair.publicKey);
  const claimDigest = await hashWorkoutClaim(example.claim);
  const gymVisit = gymVisitFor(
    example.gymVisitMinutes,
    nowMs,
    crypto.randomUUID(),
  );
  const points = calculateReward(example.claim, gymVisit);
  const attestation = await issueRewardAttestation(
    {
      walletAddress,
      claim: example.claim,
      claimDigest,
      evidence: {
        version: "spotter.evidence.v1",
        evidenceId: crypto.randomUUID(),
        source: "trusted-analysis-service",
        observedAtMs: nowMs - 1_000,
      },
      gymVisit,
    },
    secret,
    nowMs,
  );
  const walletSignature = encodeWalletSignature(
    await signBytes(
      keyPair.privateKey,
      createRewardRedemptionMessage(attestation.payload),
    ),
  );
  const receipt = await ledger.redeem(
    attestation,
    walletSignature,
    secret,
    nowMs,
  );
  return {
    attestation,
    walletSignature,
    item: {
      id: example.id,
      athlete: example.athlete,
      summary: example.summary,
      repetitions: example.claim.repetitions,
      setDurationMs: example.claim.setDurationMs,
      rangeTempoScore: example.claim.rangeTempoScore,
      gymVisitMinutes: example.gymVisitMinutes,
      claimDigest,
      memo: createWorkoutMemo(example.claim, claimDigest),
      points,
      walletAddress,
      attestationId: receipt.attestationId,
      awardedPoints: receipt.awardedPoints,
      balance: receipt.balance,
    },
  };
}

export async function runRewardDemo(options?: {
  ledger?: RewardLedger;
  secret?: string;
  nowMs?: number;
}): Promise<RewardDemoExecution> {
  const ledger = options?.ledger ?? new RewardLedger();
  const secret = options?.secret ?? REWARD_DEMO_ATTESTATION_SECRET;
  const nowMs = options?.nowMs ?? Date.now();
  const executed: ExecutedExample[] = [];
  for (const example of rewardDemoExamples) {
    executed.push(await redeemExample(example, ledger, secret, nowMs));
  }

  let replay = {
    rejected: false,
    code: null as string | null,
    message: "Replay was not attempted.",
  };
  const first = executed[0];
  if (first) {
    try {
      await ledger.redeem(
        first.attestation,
        first.walletSignature,
        secret,
        nowMs,
      );
    } catch (error) {
      replay = {
        rejected: error instanceof RewardError,
        code: error instanceof RewardError ? error.code : null,
        message:
          error instanceof Error
            ? error.message
            : "The second redemption was rejected.",
      };
    }
  }

  const athleteByWallet = new Map(
    executed.map(({ item }) => [item.walletAddress, item.athlete]),
  );
  return {
    kind: "execution",
    policyVersion: "spotter.rewards.v1",
    storage: "ephemeral-demo",
    examples: executed.map(({ item }) => item),
    leaderboard: ledger.listBalances().map((entry, index) => ({
      rank: index + 1,
      athlete: athleteByWallet.get(entry.walletAddress) ?? "Demo athlete",
      walletAddress: entry.walletAddress,
      balance: entry.balance,
    })),
    replay,
  };
}
