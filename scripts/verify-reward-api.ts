import {
  generateKeyPair,
  getAddressFromPublicKey,
  signBytes,
} from "@solana/kit";
import { analyzeSquats, demoFrames } from "../src/lib/analysis";
import {
  createRewardRedemptionMessage,
  encodeWalletSignature,
  rewardAttestationEnvelopeSchema,
} from "../src/lib/reward-policy";
import {
  createWorkoutClaim,
  hashWorkoutClaim,
} from "../src/lib/workout-proof";

if (process.env.RUN_REWARD_API !== "1")
  throw new Error(
    "This script awards ephemeral prototype points. Set RUN_REWARD_API=1 to confirm.",
  );

const baseUrl = (process.env.REWARD_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const issuerToken = process.env.REWARD_ISSUER_TOKEN;
if (!issuerToken)
  throw new Error("Set REWARD_ISSUER_TOKEN to the server's test issuer token.");
const authorizedIssuerToken = issuerToken;

async function main() {
  const keyPair = await generateKeyPair();
  const walletAddress = await getAddressFromPublicKey(keyPair.publicKey);
  const claim = createWorkoutClaim(
    analyzeSquats(demoFrames(), 1000, 1000, 12, "video"),
  );
  const now = Date.now();
  const attestResponse = await fetch(baseUrl + "/api/rewards/attest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-formchain-issuer-token": authorizedIssuerToken,
    },
    body: JSON.stringify({
      walletAddress,
      claim,
      claimDigest: await hashWorkoutClaim(claim),
      evidence: {
        version: "formchain.evidence.v1",
        evidenceId: crypto.randomUUID(),
        source: "trusted-analysis-service",
        observedAtMs: now,
      },
    }),
  });
  if (attestResponse.status !== 201)
    throw new Error(
      `Attestation failed (${attestResponse.status}): ${await attestResponse.text()}`,
    );
  const attestation = rewardAttestationEnvelopeSchema.parse(
    await attestResponse.json(),
  );
  const walletSignature = encodeWalletSignature(
    await signBytes(
      keyPair.privateKey,
      createRewardRedemptionMessage(attestation.payload),
    ),
  );
  const body = JSON.stringify({ attestation, walletSignature });
  const redeemed = await fetch(baseUrl + "/api/rewards/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (redeemed.status !== 201)
    throw new Error(
      `Redemption failed (${redeemed.status}): ${await redeemed.text()}`,
    );
  const receipt = await redeemed.json();

  const replay = await fetch(baseUrl + "/api/rewards/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (replay.status !== 409)
    throw new Error(`Expected replay rejection, received ${replay.status}.`);

  console.log(
    JSON.stringify(
      {
        attestationId: attestation.payload.attestationId,
        awardedPoints: receipt.awardedPoints,
        balance: receipt.balance,
        replayStatus: replay.status,
        storage: receipt.storage,
      },
      null,
      2,
    ),
  );
}

void main();
