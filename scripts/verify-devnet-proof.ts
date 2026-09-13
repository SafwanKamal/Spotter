import { createClient, lamports } from "@solana/kit";
import { memoProgram } from "@solana-program/memo";
import { solanaDevnetRpc } from "@solana/kit-plugin-rpc";
import {
  airdropSigner,
  generatedSigner,
  signerFromFile,
} from "@solana/kit-plugin-signer";
import { analyzeSquats, demoFrames } from "../src/lib/analysis";
import {
  createWorkoutClaim,
  createWorkoutMemo,
  devnetExplorerUrl,
  hashWorkoutClaim,
} from "../src/lib/workout-proof";

if (process.env.RUN_SOLANA_DEVNET !== "1") {
  throw new Error(
    "This script writes a test memo to Solana devnet. Set RUN_SOLANA_DEVNET=1 to confirm.",
  );
}

async function main() {
  const keypairPath = process.env.SOLANA_KEYPAIR_PATH?.trim();
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const client = keypairPath
    ? await createClient()
        .use(signerFromFile(keypairPath))
        .use(solanaDevnetRpc({ rpcUrl }))
        .use(memoProgram())
    : await createClient()
        .use(generatedSigner())
        .use(solanaDevnetRpc({ rpcUrl }))
        .use(airdropSigner(lamports(10_000_000n)))
        .use(memoProgram());

  const workoutMemo = process.env.SOLANA_WORKOUT_MEMO === "1";
  let memo: string;
  if (workoutMemo) {
    const claim = createWorkoutClaim(
      analyzeSquats(demoFrames(), 1000, 1000, 12, "video"),
    );
    memo = createWorkoutMemo(claim, await hashWorkoutClaim(claim));
  } else {
    const nonce = crypto.randomUUID();
    memo = "spotter:integration-test:v1|nonce=" + nonce;
  }

  const result = await client.memo.instructions
    .addMemo({ memo })
    .sendTransaction();
  const signature = String(result.context.signature);

  console.log("wallet", client.identity.address);
  console.log(devnetExplorerUrl(signature));
}

void main();
