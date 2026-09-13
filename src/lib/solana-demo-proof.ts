import { access } from "node:fs/promises";
import { createClient } from "@solana/kit";
import { memoProgram } from "@solana-program/memo";
import { solanaDevnetRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import type { Analysis } from "./analysis";
import {
  createWorkoutClaim,
  createWorkoutMemo,
  devnetExplorerUrl,
  hashWorkoutClaim,
  type DemoProofAnalysis,
} from "./workout-proof";

const MIN_FEE_LAMPORTS = 5_000n;
export function demoProofEnabled(): boolean {
  return process.env.SOLANA_DEMO_PROOF === "1";
}

export function demoKeypairPath(): string | null {
  const path = process.env.SOLANA_KEYPAIR_PATH?.trim();
  return path || null;
}

export function demoProofConfigured(): boolean {
  return demoProofEnabled() && Boolean(demoKeypairPath());
}

function rpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    "https://api.devnet.solana.com"
  );
}

async function createDemoClient() {
  const path = demoKeypairPath();
  if (!demoProofEnabled() || !path) {
    throw new Error(
      "Local demo proof is not configured. Set SOLANA_DEMO_PROOF=1 and SOLANA_KEYPAIR_PATH.",
    );
  }
  await access(path);
  return await createClient()
    .use(signerFromFile(path))
    .use(solanaDevnetRpc({ rpcUrl: rpcUrl() }))
    .use(memoProgram());
}

function analysisForClaim(input: DemoProofAnalysis): Analysis {
  return {
    version: 2,
    exercise: "squat",
    source: "video",
    duration: input.duration,
    side: "left",
    coverage: input.coverage,
    reps: input.reps as Analysis["reps"],
    measurements: [],
    movementScore: input.movementScore,
    cues: [],
    detection: {
      baseline: 0,
      notes: [],
      algorithm: "relative-excursion-v2",
    },
  };
}

export async function getDemoProofStatus() {
  if (!demoProofConfigured()) {
    return { configured: false as const };
  }
  const path = demoKeypairPath();
  if (!path) return { configured: false as const };
  try {
    await access(path);
  } catch {
    return {
      configured: false as const,
      error: "The configured keypair file is not readable.",
    };
  }
  try {
    const client = await createDemoClient();
    const address = client.identity.address;
    const balance = await client.rpc.getBalance(address).send();
    const lamports = BigInt(balance.value);
    return {
      configured: true as const,
      address,
      lamports: lamports.toString(),
      funded: lamports >= MIN_FEE_LAMPORTS,
    };
  } catch (error) {
    return {
      configured: true as const,
      address: null,
      lamports: null,
      funded: false,
      error:
        error instanceof Error
          ? error.message
          : "The demo wallet status could not be loaded.",
    };
  }
}

export async function submitDemoWorkoutProof(input: DemoProofAnalysis) {
  const claim = createWorkoutClaim(analysisForClaim(input));
  const digest = await hashWorkoutClaim(claim);
  const memo = createWorkoutMemo(claim, digest);
  const client = await createDemoClient();
  const balance = await client.rpc.getBalance(client.identity.address).send();
  if (BigInt(balance.value) < MIN_FEE_LAMPORTS) {
    throw new Error(
      "The demo wallet needs a small amount of devnet SOL. Fund " +
        client.identity.address +
        " at https://faucet.solana.com then try again.",
    );
  }
  const result = await client.memo.instructions
    .addMemo({ memo })
    .sendTransaction();
  const signature = String(result.context.signature);
  return {
    signature,
    explorerUrl: devnetExplorerUrl(signature),
    walletAddress: client.identity.address,
    claimDigest: digest,
  };
}
