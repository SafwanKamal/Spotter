import { loadEnvConfig } from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { address, createClient } from "@solana/kit";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { solanaDevnetRpc } from "@solana/kit-plugin-rpc";
import {
  competitionSchema,
  competitionTerms,
  ranked,
  resultsText,
} from "../src/lib/competitions";
import {
  competitionAddress,
  digestBytes,
  fundInstruction,
  finalizeInstruction,
  claimInstruction,
  decodePool,
  awards,
} from "../src/lib/competition-chain";
import { systemProgram } from "@solana-program/system";
import { DEVNET_GENESIS } from "../src/lib/solana-transfer";
loadEnvConfig(process.cwd());
async function main() {
  if (process.env.RUN_SOLANA_DEVNET !== "1")
    throw new Error("Set RUN_SOLANA_DEVNET=1; test funds only.");
  if (
    !process.env.SOLANA_KEYPAIR_PATH ||
    !process.env.NEXT_PUBLIC_COMPETITION_PROGRAM_ID
  )
    throw new Error("Deploy and configure the competition program first.");
  const client = await createClient()
    .use(signerFromFile(process.env.SOLANA_KEYPAIR_PATH))
    .use(
      solanaDevnetRpc({
        rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      }),
    )
    .use(systemProgram());
  if ((await client.rpc.getGenesisHash().send()) !== DEVNET_GENESIS)
    throw new Error("Refusing non-devnet RPC.");
  const program = address(process.env.NEXT_PUBLIC_COMPETITION_PROGRAM_ID);
  const competitions = (
    JSON.parse(await readFile(".data/competitions.json", "utf8")) as unknown[]
  ).map((c) => competitionSchema.parse(c));
  if (
    competitions.some((c) => !c.demo || c.organizer !== client.identity.address)
  )
    throw new Error(
      "This runner only operates the local organizer's fictional demo competitions.",
    );
  const receipts: Record<string, string> = JSON.parse(
    await readFile(".data/competition-demo-receipts.json", "utf8").catch(
      () => "{}",
    ),
  );
  const state = async (pool: ReturnType<typeof address>) => {
    const { value } = await client.rpc
      .getAccountInfo(pool, { encoding: "base64", commitment: "confirmed" })
      .send();
    return value
      ? decodePool(new Uint8Array(Buffer.from(value.data[0], "base64")))
      : null;
  };
  for (const c of competitions) {
    let digest = await digestBytes(competitionTerms(c)),
      pool = await competitionAddress(program, client.identity.address, digest);
    if (await state(pool)) continue;
    if (c.id === "community-lunge-finish") {
      // Rehearsal only: move an unfunded local demo close into the near future.
      c.endsAt = Math.floor(Date.now() / 1000) + 45;
      c.updatedAt = Math.floor(Date.now() / 1000);
      await writeFile(
        ".data/competitions.json",
        JSON.stringify(competitions, null, 2),
      );
      digest = await digestBytes(competitionTerms(c));
      pool = await competitionAddress(program, client.identity.address, digest);
    }
    if (c.endsAt <= Date.now() / 1000)
      throw new Error(
        `Unfunded competition ${c.id} expired; publish new terms deliberately.`,
      );
    const result = await client.sendTransaction(
      fundInstruction(
        program,
        client.identity,
        pool,
        digest,
        c.endsAt,
        BigInt(c.targetLamports),
      ),
    );
    receipts[`${c.id}:fund`] = String(result.context.signature);
    assert.equal((await state(pool))?.funded, c.targetLamports);
    console.log(
      JSON.stringify({
        competition: c.id,
        pool,
        funded: c.targetLamports,
        signature: result.context.signature,
      }),
    );
    await writeFile(
      ".data/competition-demo-receipts.json",
      JSON.stringify(receipts, null, 2),
    );
  }
  const c = competitions.find((c) => c.id === "community-lunge-finish")!;
  const pool = await competitionAddress(
    program,
    client.identity.address,
    await digestBytes(competitionTerms(c)),
  );
  while (Date.now() / 1000 <= c.endsAt + 2)
    await new Promise((r) => setTimeout(r, 1000));
  if (!(await state(pool))?.finalized) {
    const result = await client.sendTransaction(
      finalizeInstruction(
        program,
        client.identity,
        pool,
        ranked(c)
          .slice(0, 3)
          .map((p) => p.wallet),
        await digestBytes(resultsText(c)),
      ),
    );
    receipts[`${c.id}:finalize`] = String(result.context.signature);
    console.log(
      JSON.stringify({ finalized: c.id, signature: result.context.signature }),
    );
    await writeFile(
      ".data/competition-demo-receipts.json",
      JSON.stringify(receipts, null, 2),
    );
  }
  const names = ["alex", "jordan", "sam"];
  for (let rank = 0; rank < 3; rank++) {
    const signer = (
      await createClient().use(
        signerFromFile(`.data/competition-${names[rank]}.keypair.json`),
      )
    ).identity;
    assert.equal(signer.address, ranked(c)[rank].wallet);
    if ((await state(pool))!.claimed & (1 << rank)) continue;
    // A brand-new recipient needs rent-exempt account funding separately from its prize.
    if ((await client.rpc.getBalance(signer.address).send()).value === 0n) {
      const setup = await client.system.instructions
        .transferSol({
          source: client.identity,
          destination: signer.address,
          amount: 1_000_000n,
        })
        .sendTransaction();
      receipts[`${c.id}:wallet-setup-${rank + 1}`] = String(
        setup.context.signature,
      );
      await writeFile(
        ".data/competition-demo-receipts.json",
        JSON.stringify(receipts, null, 2),
      );
    }
    const before = (
      await client.rpc
        .getBalance(signer.address, { commitment: "confirmed" })
        .send()
    ).value;
    const result = await client.sendTransaction(
      claimInstruction(program, signer, pool, rank),
    );
    const after = (
      await client.rpc
        .getBalance(signer.address, { commitment: "confirmed" })
        .send()
    ).value;
    assert.equal(after - before, awards(BigInt(c.targetLamports))[rank]);
    receipts[`${c.id}:claim-${rank + 1}`] = String(result.context.signature);
    console.log(
      JSON.stringify({
        rank: rank + 1,
        recipient: signer.address,
        receivedLamports: String(after - before),
        signature: result.context.signature,
      }),
    );
    await writeFile(
      ".data/competition-demo-receipts.json",
      JSON.stringify(receipts, null, 2),
    );
  }
  assert.equal((await state(pool))?.claimed, 7);
  console.log(
    "Devnet competition verified: funded, finalized after close, all three prizes received. Reruns skip recorded on-chain funding/finalization/claims.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
