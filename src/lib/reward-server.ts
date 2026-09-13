import "server-only";

import { timingSafeEqual } from "node:crypto";
import { RewardLedger } from "./reward-policy";

const rewardLedgerKey = Symbol.for("formchain.reward-ledger.v1");
type RewardGlobal = typeof globalThis & {
  [rewardLedgerKey]?: RewardLedger;
};

export function rewardAttestationSecret(): string | null {
  const secret = process.env.REWARD_ATTESTATION_SECRET;
  return secret && new TextEncoder().encode(secret).byteLength >= 32
    ? secret
    : null;
}

export function authorizedRewardIssuer(candidate: string | null): boolean {
  const expected = process.env.REWARD_ISSUER_TOKEN;
  if (!expected || !candidate) return false;
  const expectedBytes = Buffer.from(expected);
  const candidateBytes = Buffer.from(candidate);
  return (
    expectedBytes.byteLength === candidateBytes.byteLength &&
    timingSafeEqual(expectedBytes, candidateBytes)
  );
}

export function rewardLedger(): RewardLedger {
  const shared = globalThis as RewardGlobal;
  shared[rewardLedgerKey] ??= new RewardLedger();
  return shared[rewardLedgerKey];
}

export async function readBoundedJson(
  request: Request,
  maxBytes = 16_384,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RangeError("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
