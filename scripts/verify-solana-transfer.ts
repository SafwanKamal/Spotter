import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { createClient, generateKeyPairSigner, lamports } from "@solana/kit";
import { systemProgram } from "@solana-program/system";
import {
  generatedSigner,
  signerFromFile,
  airdropSigner,
} from "@solana/kit-plugin-signer";
import { solanaDevnetRpc } from "@solana/kit-plugin-rpc";
import { litesvm } from "@solana/kit-plugin-litesvm";
import { DEVNET_GENESIS } from "../src/lib/solana-transfer";
loadEnvConfig(process.cwd());
async function main() {
  const live = process.env.RUN_SOLANA_DEVNET === "1";
  const recipient = await generateKeyPairSigner();
  const client = live
    ? await (
        process.env.SOLANA_KEYPAIR_PATH
          ? createClient().use(signerFromFile(process.env.SOLANA_KEYPAIR_PATH))
          : createClient().use(generatedSigner())
      )
        .use(
          solanaDevnetRpc({
            rpcUrl:
              process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
          }),
        )
        .use(systemProgram())
    : await createClient()
        .use(generatedSigner())
        .use(litesvm())
        .use(airdropSigner(lamports(10_000_000n)))
        .use(systemProgram());
  if (
    live &&
    "getGenesisHash" in client.rpc &&
    (await client.rpc.getGenesisHash().send()) !== DEVNET_GENESIS
  )
    throw new Error("Refusing non-devnet RPC.");
  const before = (await client.rpc.getBalance(recipient.address).send()).value;
  const funding = (await client.rpc.getBalance(client.identity.address).send())
    .value;
  console.log(
    JSON.stringify({
      network: live ? "devnet" : "LiteSVM",
      sender: client.identity.address,
      recipient: recipient.address,
      senderLamports: String(funding),
    }),
  );
  if (live && funding < 1_100_000n) {
    await client.rpc
      .requestAirdrop(client.identity.address, lamports(10_000_000n))
      .send();
    await new Promise((r) => setTimeout(r, 3000));
  }
  const amount = 1_000_000n;
  const result = await client.system.instructions
    .transferSol({
      source: client.identity,
      destination: recipient.address,
      amount,
    })
    .sendTransaction();
  const signature = String(result.context.signature);
  // RPC balance uses confirmed commitment; the send pipeline waits for confirmation.
  const after = (
    await client.rpc
      .getBalance(recipient.address, { commitment: "confirmed" })
      .send()
  ).value;
  assert.equal(after - before, amount);
  console.log(
    JSON.stringify({
      signature,
      recipientDelta: String(after - before),
      verified: true,
      ...(live
        ? {
            explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
          }
        : {}),
    }),
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
