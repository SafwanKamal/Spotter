import { z } from "zod";
import {
  RewardError,
  rewardRedemptionRequestSchema,
} from "@/lib/reward-policy";
import {
  readBoundedJson,
  rewardAttestationSecret,
  rewardLedger,
} from "@/lib/reward-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = rewardAttestationSecret();
  if (!secret)
    return Response.json(
      { error: "Reward redemption is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const input = rewardRedemptionRequestSchema.parse(
      await readBoundedJson(request),
    );
    const receipt = await rewardLedger().redeem(
      input.attestation,
      input.walletSignature,
      secret,
    );
    return Response.json(receipt, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status =
      error instanceof RangeError
        ? 413
        : error instanceof RewardError &&
            error.code === "attestation_replayed"
          ? 409
          : error instanceof RewardError &&
              error.code === "attestation_expired"
            ? 410
            : error instanceof RewardError &&
                error.code === "wallet_signature_invalid"
              ? 401
              : 400;
    const message =
      error instanceof RewardError
        ? error.message
        : error instanceof z.ZodError
          ? "The redemption payload is invalid."
          : error instanceof RangeError
            ? "The redemption request exceeds 16 KB."
            : "The redemption request is invalid.";
    return Response.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
