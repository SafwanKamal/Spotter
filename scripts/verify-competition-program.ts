import assert from "node:assert/strict";
import { createClient, generateKeyPairSigner, lamports } from "@solana/kit";
import { generatedSigner, airdropSigner } from "@solana/kit-plugin-signer";
import { litesvm } from "@solana/kit-plugin-litesvm";
import {
  competitionAddress,
  fundInstruction,
  finalizeInstruction,
  claimInstruction,
  digestBytes,
  decodePool,
  awards,
} from "../src/lib/competition-chain";
async function main() {
  const c = await createClient()
    .use(generatedSigner())
    .use(litesvm())
    .use(airdropSigner(lamports(100_000_000n)));
  const program = (await generateKeyPairSigner()).address;
  c.svm.addProgramFromFile(
    program,
    "programs/competition/target/deploy/formchain_competition.so",
  );
  const digest = await digestBytes("competition-test"),
    pool = await competitionAddress(program, c.identity.address, digest);
  const players = await Promise.all(
    [0, 1, 2, 3].map(() => generateKeyPairSigner()),
  );
  for (const p of players) await c.airdrop(p.address, lamports(1_000_000n));
  const end = Number(c.svm.getClock().unixTimestamp) + 60;
  await c.sendTransaction(
    fundInstruction(program, c.identity, pool, digest, end, 10_000_003n),
  );
  const state = () => {
    const account = c.svm.getAccount(pool);
    if (!account.exists) throw new Error("Pool missing");
    return decodePool(new Uint8Array(account.data));
  };
  assert.equal(state().funded, "10000003");
  const result = await digestBytes("reviewed-results");
  const final = finalizeInstruction(
    program,
    c.identity,
    pool,
    players.slice(0, 3).map((p) => p.address),
    result,
  );
  await assert.rejects(c.sendTransaction(final), "early finalization");
  const clock = c.svm.getClock();
  clock.unixTimestamp = BigInt(end + 1);
  c.svm.setClock(clock);
  c.svm.expireBlockhash();
  await assert.rejects(
    c.sendTransaction(
      finalizeInstruction(
        program,
        players[3],
        pool,
        players.slice(0, 3).map((p) => p.address),
        result,
      ),
    ),
    "wrong organizer",
  );
  await c.sendTransaction(final);
  c.svm.expireBlockhash();
  await assert.rejects(c.sendTransaction(final), "second finalization");
  await assert.rejects(
    c.sendTransaction(claimInstruction(program, players[3], pool, 0)),
    "wrong winner",
  );
  // Even with an artificially depleted pool, a failed claim must not mark it paid.
  const savedPool = c.svm.getAccount(pool);
  if (!savedPool.exists) throw new Error("Missing pool");
  c.svm.setAccount({ ...savedPool, lamports: lamports(1n) });
  const winnerBefore = c.svm.getBalance(players[0].address);
  await assert.rejects(
    c.sendTransaction(claimInstruction(program, players[0], pool, 0)),
    "insufficient escrow",
  );
  assert.equal(state().claimed, 0);
  assert.equal(c.svm.getBalance(players[0].address), winnerBefore);
  c.svm.setAccount(savedPool);
  c.svm.expireBlockhash();
  const before = c.svm.getBalance(pool)!;
  for (let rank = 0; rank < 3; rank++) {
    const original = c.svm.getBalance(players[rank].address)!;
    await c.sendTransaction(
      claimInstruction(program, players[rank], pool, rank),
    );
    assert.equal(
      c.svm.getBalance(players[rank].address)! - original,
      awards(10_000_003n)[rank],
    );
    c.svm.expireBlockhash();
    await assert.rejects(
      c.sendTransaction(claimInstruction(program, players[rank], pool, rank)),
      "repeat claim",
    );
  }
  assert.equal(before - c.svm.getBalance(pool)!, 10_000_003n);
  assert.equal(state().claimed, 7);
  console.log(
    "Competition program passed: escrow funding, end-time gate, issuer authorization, immutable finalization, winner binding, exact 50/30/remainder payouts, repeat rejection, insufficient-fund rollback and rent preservation (LiteSVM).",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
