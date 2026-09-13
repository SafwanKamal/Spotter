import { createClient, lamports } from "@solana/kit";
import { memoProgram } from "@solana-program/memo";
import {
  isFailedTransaction,
  litesvm,
  type LiteSvmSendContext,
} from "@solana/kit-plugin-litesvm";
import { airdropSigner, generatedSigner } from "@solana/kit-plugin-signer";
import {
  describeRewardDemoExamples,
  runRewardDemo,
} from "../src/lib/reward-demo";

async function submitLocalMemo(memo: string) {
  const client = await createClient()
    .use(generatedSigner())
    .use(litesvm())
    .use(airdropSigner(lamports(10_000_000n)))
    .use(memoProgram());
  const result = await client.memo.instructions
    .addMemo({ memo })
    .sendTransaction();
  const metadata = (result.context as LiteSvmSendContext).transactionMetadata;
  if (isFailedTransaction(metadata)) {
    throw new Error("The local Memo transaction failed.");
  }
  if (!metadata.logs().some((line: string) => line.includes(memo))) {
    throw new Error("The local validator logs did not include the workout memo.");
  }
  return {
    walletAddress: client.identity.address,
    signature: String(result.context.signature),
  };
}

async function main() {
  const catalog = await describeRewardDemoExamples();
  const memos = [];
  for (const example of catalog) {
    memos.push({
      athlete: example.athlete,
      memo: example.memo,
      ...(await submitLocalMemo(example.memo)),
    });
  }
  const execution = await runRewardDemo();
  console.log(
    JSON.stringify(
      {
        policyVersion: execution.policyVersion,
        storage: execution.storage,
        localValidator: memos,
        examples: execution.examples.map((example) => ({
          athlete: example.athlete,
          repetitions: example.repetitions,
          awardedPoints: example.awardedPoints,
          walletAddress: example.walletAddress,
          memo: example.memo,
        })),
        leaderboard: execution.leaderboard,
        replay: execution.replay,
      },
      null,
      2,
    ),
  );
}

void main();
