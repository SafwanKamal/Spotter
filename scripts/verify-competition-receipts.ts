import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import {
  createSolanaRpc,
  signature,
  address,
  getAddressDecoder,
} from "@solana/kit";
import { DEVNET_GENESIS } from "../src/lib/solana-transfer";
import assert from "node:assert/strict";
loadEnvConfig(process.cwd());
async function main() {
  const rpc = createSolanaRpc(
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  );
  if ((await rpc.getGenesisHash().send()) !== DEVNET_GENESIS)
    throw new Error("Not devnet");
  const program = address(process.env.NEXT_PUBLIC_COMPETITION_PROGRAM_ID!);
  const programAccount = (
    await rpc.getAccountInfo(program, { encoding: "base64" }).send()
  ).value;
  assert.ok(programAccount?.executable, "Program must be executable");
  const programBytes = Buffer.from(programAccount.data[0], "base64");
  const programDataAddress = getAddressDecoder().decode(
    programBytes.subarray(4, 36),
  );
  const programData = (
    await rpc.getAccountInfo(programDataAddress, { encoding: "base64" }).send()
  ).value;
  assert.ok(programData, "Program data is missing");
  const deployed = Buffer.from(programData.data[0], "base64").subarray(45);
  const built = await readFile(
    "programs/competition/target/deploy/formchain_competition.so",
  );
  assert.ok(
    deployed.equals(built),
    "Deployed binary must match the locally tested binary",
  );
  console.log("Deployed program bytes match the LiteSVM-tested binary.");
  const receipts = JSON.parse(
    await readFile(".data/competition-demo-receipts.json", "utf8"),
  ) as Record<string, string>;
  const entries = Object.entries(receipts);
  const statuses = await rpc
    .getSignatureStatuses(
      entries.map(([, s]) => signature(s)),
      { searchTransactionHistory: true },
    )
    .send();
  for (let i = 0; i < entries.length; i++) {
    const status = statuses.value[i];
    if (!status || status.err || status.confirmationStatus !== "finalized")
      throw new Error(`Receipt ${entries[i][0]} is not successfully finalized`);
    console.log(`${entries[i][0]}: finalized ${entries[i][1]}`);
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
