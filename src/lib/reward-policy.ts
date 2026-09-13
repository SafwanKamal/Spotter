import {
  address,
  getPublicKeyFromAddress,
  isAddress,
  signatureBytes,
  verifySignature,
} from "@solana/kit";
import { z } from "zod";
import {
  hashWorkoutClaim,
  workoutClaimSchema,
} from "./workout-proof";

const textEncoder = new TextEncoder();
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/).max(256);
const walletAddressSchema = z.string().refine(isAddress, "Invalid wallet address");

export const verifiedGymVisitSchema = z
  .object({
    version: z.literal("spotter.gym-visit.v1"),
    visitId: z.string().uuid(),
    gymId: z.string().trim().min(1).max(80),
    method: z.literal("rotating-gym-qr"),
    checkedInAtMs: z.number().int().nonnegative(),
    checkedOutAtMs: z.number().int().positive(),
  })
  .refine(
    (visit) => {
      const duration = visit.checkedOutAtMs - visit.checkedInAtMs;
      return duration >= 60_000 && duration <= 12 * 60 * 60 * 1_000;
    },
    { message: "A verified gym visit must last between 1 minute and 12 hours." },
  );

export const rewardIssueInputSchema = z.object({
  walletAddress: walletAddressSchema,
  claim: workoutClaimSchema,
  claimDigest: digestSchema,
  evidence: z.object({
    version: z.literal("spotter.evidence.v1"),
    evidenceId: z.string().uuid(),
    source: z.literal("trusted-analysis-service"),
    observedAtMs: z.number().int().nonnegative(),
  }),
  gymVisit: verifiedGymVisitSchema.optional(),
});

export type RewardIssueInput = z.infer<typeof rewardIssueInputSchema>;

export const rewardBreakdownSchema = z.object({
  completedSet: z.number().int().min(0).max(10),
  repetitions: z.number().int().min(0).max(40),
  verifiedGymTime: z.number().int().min(0).max(12),
  total: z.number().int().min(0).max(60),
});

export const rewardAttestationPayloadSchema = z.object({
  version: z.literal("spotter.reward-attestation.v1"),
  attestationId: z.string().uuid(),
  policyVersion: z.literal("spotter.rewards.v1"),
  walletAddress: walletAddressSchema,
  claimDigest: digestSchema,
  evidenceId: z.string().uuid(),
  evidenceSource: z.literal("trusted-analysis-service"),
  workout: z.object({
    exercise: z.literal("squat"),
    repetitions: z.number().int().min(1).max(100),
    setDurationMs: z.number().int().min(3_000).max(30_000),
    trackingPermille: z.number().int().min(750).max(1_000),
  }),
  gymVisitId: z.string().uuid().nullable(),
  verifiedGymSeconds: z.number().int().min(0).max(43_200),
  points: rewardBreakdownSchema,
  issuedAtMs: z.number().int().nonnegative(),
  expiresAtMs: z.number().int().positive(),
});

export type RewardAttestationPayload = z.infer<
  typeof rewardAttestationPayloadSchema
>;

export const rewardAttestationEnvelopeSchema = z.object({
  payload: rewardAttestationPayloadSchema,
  signature: base64UrlSchema,
});

export type RewardAttestationEnvelope = z.infer<
  typeof rewardAttestationEnvelopeSchema
>;

export const rewardRedemptionRequestSchema = z.object({
  attestation: rewardAttestationEnvelopeSchema,
  walletSignature: base64UrlSchema,
});

export type RewardReceipt = {
  attestationId: string;
  walletAddress: string;
  policyVersion: "spotter.rewards.v1";
  awardedPoints: number;
  balance: number;
  redeemedAtMs: number;
  storage: "ephemeral-prototype";
};

export type RewardErrorCode =
  | "attestation_expired"
  | "attestation_invalid"
  | "attestation_replayed"
  | "claim_digest_mismatch"
  | "wallet_signature_invalid";

export class RewardError extends Error {
  constructor(
    readonly code: RewardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RewardError";
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const checked = base64UrlSchema.parse(value);
  const base64 = checked.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(secret: string, usage: KeyUsage[]) {
  if (textEncoder.encode(secret).byteLength < 32)
    throw new Error("Reward attestation secret must contain at least 32 bytes.");
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

export function serializeRewardAttestation(
  payload: RewardAttestationPayload,
): string {
  return JSON.stringify(rewardAttestationPayloadSchema.parse(payload));
}

export function calculateReward(
  claim: z.infer<typeof workoutClaimSchema>,
  gymVisit?: z.infer<typeof verifiedGymVisitSchema>,
) {
  const checkedClaim = workoutClaimSchema.parse(claim);
  const checkedVisit = gymVisit
    ? verifiedGymVisitSchema.parse(gymVisit)
    : undefined;
  const completedSet = 10;
  const repetitions = Math.min(checkedClaim.repetitions, 20) * 2;
  const verifiedGymTime = checkedVisit
    ? Math.min(
        12,
        Math.floor(
          (checkedVisit.checkedOutAtMs - checkedVisit.checkedInAtMs) /
            (5 * 60 * 1_000),
        ),
      )
    : 0;
  return rewardBreakdownSchema.parse({
    completedSet,
    repetitions,
    verifiedGymTime,
    total: Math.min(60, completedSet + repetitions + verifiedGymTime),
  });
}

export async function issueRewardAttestation(
  untrustedInput: unknown,
  secret: string,
  nowMs = Date.now(),
): Promise<RewardAttestationEnvelope> {
  const input = rewardIssueInputSchema.parse(untrustedInput);
  if ((await hashWorkoutClaim(input.claim)) !== input.claimDigest)
    throw new RewardError(
      "claim_digest_mismatch",
      "The claim does not match its digest.",
    );
  if (
    input.evidence.observedAtMs > nowMs + 5 * 60_000 ||
    input.evidence.observedAtMs < nowMs - 24 * 60 * 60_000
  )
    throw new RewardError(
      "attestation_invalid",
      "Trusted workout evidence is outside the accepted time window.",
    );
  if (input.gymVisit && input.gymVisit.checkedOutAtMs > nowMs + 5 * 60_000)
    throw new RewardError(
      "attestation_invalid",
      "The verified gym visit ends in the future.",
    );

  const verifiedGymSeconds = input.gymVisit
    ? Math.floor(
        (input.gymVisit.checkedOutAtMs - input.gymVisit.checkedInAtMs) / 1_000,
      )
    : 0;
  const payload = rewardAttestationPayloadSchema.parse({
    version: "spotter.reward-attestation.v1",
    attestationId: crypto.randomUUID(),
    policyVersion: "spotter.rewards.v1",
    walletAddress: input.walletAddress,
    claimDigest: input.claimDigest,
    evidenceId: input.evidence.evidenceId,
    evidenceSource: input.evidence.source,
    workout: {
      exercise: input.claim.exercise,
      repetitions: input.claim.repetitions,
      setDurationMs: input.claim.setDurationMs,
      trackingPermille: input.claim.trackingPermille,
    },
    gymVisitId: input.gymVisit?.visitId ?? null,
    verifiedGymSeconds,
    points: calculateReward(input.claim, input.gymVisit),
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + 10 * 60_000,
  });
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, ["sign"]),
    textEncoder.encode(serializeRewardAttestation(payload)),
  );
  return { payload, signature: bytesToBase64Url(new Uint8Array(signature)) };
}

export async function verifyRewardAttestation(
  untrustedEnvelope: unknown,
  secret: string,
  nowMs = Date.now(),
): Promise<RewardAttestationPayload> {
  let envelope: RewardAttestationEnvelope;
  try {
    envelope = rewardAttestationEnvelopeSchema.parse(untrustedEnvelope);
    const encodedSignature = Uint8Array.from(
      base64UrlToBytes(envelope.signature),
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, ["verify"]),
      encodedSignature,
      textEncoder.encode(serializeRewardAttestation(envelope.payload)),
    );
    if (!valid) throw new Error("Bad signature");
  } catch {
    throw new RewardError(
      "attestation_invalid",
      "The reward attestation is invalid.",
    );
  }
  if (envelope.payload.expiresAtMs < nowMs)
    throw new RewardError(
      "attestation_expired",
      "The reward attestation has expired.",
    );
  return envelope.payload;
}

export function createRewardRedemptionMessage(
  payload: RewardAttestationPayload,
): Uint8Array {
  const checked = rewardAttestationPayloadSchema.parse(payload);
  return textEncoder.encode(
    [
      "spotter:redeem:v1",
      "attestation_id=" + checked.attestationId,
      "claim_sha256=" + checked.claimDigest,
    ].join("|"),
  );
}

export async function verifyWalletRedemptionSignature(
  payload: RewardAttestationPayload,
  encodedSignature: string,
): Promise<boolean> {
  try {
    const publicKey = await getPublicKeyFromAddress(
      address(payload.walletAddress),
    );
    return await verifySignature(
      publicKey,
      signatureBytes(base64UrlToBytes(encodedSignature)),
      createRewardRedemptionMessage(payload),
    );
  } catch {
    return false;
  }
}

export function encodeWalletSignature(
  signature: Readonly<Uint8Array>,
): string {
  return bytesToBase64Url(Uint8Array.from(signature));
}

export class RewardLedger {
  private readonly balances = new Map<string, number>();
  private readonly redeemedAttestations = new Set<string>();
  private readonly redeemedClaims = new Set<string>();
  private readonly redeemedEvidence = new Set<string>();
  private readonly rewardedGymVisits = new Set<string>();

  listBalances(): { walletAddress: string; balance: number }[] {
    return [...this.balances.entries()]
      .map(([walletAddress, balance]) => ({ walletAddress, balance }))
      .sort(
        (a, b) =>
          b.balance - a.balance ||
          a.walletAddress.localeCompare(b.walletAddress),
      );
  }

  async redeem(
    untrustedAttestation: unknown,
    walletSignature: string,
    secret: string,
    nowMs = Date.now(),
  ): Promise<RewardReceipt> {
    const payload = await verifyRewardAttestation(
      untrustedAttestation,
      secret,
      nowMs,
    );
    if (
      !(await verifyWalletRedemptionSignature(payload, walletSignature))
    )
      throw new RewardError(
        "wallet_signature_invalid",
        "The connected wallet did not sign this redemption.",
      );
    const claimKey = payload.walletAddress + ":" + payload.claimDigest;
    if (
      this.redeemedAttestations.has(payload.attestationId) ||
      this.redeemedClaims.has(claimKey) ||
      this.redeemedEvidence.has(payload.evidenceId) ||
      (payload.gymVisitId !== null &&
        this.rewardedGymVisits.has(payload.gymVisitId))
    )
      throw new RewardError(
        "attestation_replayed",
        "This attestation, workout evidence, or gym visit has already earned points.",
      );

    const balance =
      (this.balances.get(payload.walletAddress) ?? 0) + payload.points.total;
    this.redeemedAttestations.add(payload.attestationId);
    this.redeemedClaims.add(claimKey);
    this.redeemedEvidence.add(payload.evidenceId);
    if (payload.gymVisitId !== null)
      this.rewardedGymVisits.add(payload.gymVisitId);
    this.balances.set(payload.walletAddress, balance);
    return {
      attestationId: payload.attestationId,
      walletAddress: payload.walletAddress,
      policyVersion: payload.policyVersion,
      awardedPoints: payload.points.total,
      balance,
      redeemedAtMs: nowMs,
      storage: "ephemeral-prototype",
    };
  }
}
