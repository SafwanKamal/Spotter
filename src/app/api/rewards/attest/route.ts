import { z } from "zod";
import {
  issueRewardAttestation,
  RewardError,
} from "@/lib/reward-policy";
import {
  authorizedRewardIssuer,
  readBoundedJson,
  rewardAttestationSecret,
} from "@/lib/reward-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = rewardAttestationSecret();
  if (!secret)
    return Response.json(
      { error: "Reward attestation is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  if (!authorizedRewardIssuer(request.headers.get("x-spotter-issuer-token")))
    return Response.json(
      { error: "The reward issuer is not authorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const attestation = await issueRewardAttestation(
      await readBoundedJson(request),
      secret,
    );
    return Response.json(attestation, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof RewardError
        ? error.message
        : error instanceof z.ZodError
          ? "The trusted evidence payload is invalid."
          : error instanceof RangeError
            ? "The reward request exceeds 16 KB."
            : "The reward request is invalid.";
    const status = error instanceof RangeError ? 413 : 400;
    return Response.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
