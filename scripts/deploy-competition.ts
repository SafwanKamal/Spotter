import { loadEnvConfig } from "@next/env";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import {
  createClient,
  generateKeyPairSigner,
  getAddressEncoder,
} from "@solana/kit";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { solanaDevnetRpc } from "@solana/kit-plugin-rpc";
import { DEVNET_GENESIS } from "../src/lib/solana-transfer";
loadEnvConfig(process.cwd());
async function main() {
  if (process.env.RUN_SOLANA_DEVNET !== "1")
    throw new Error("Set RUN_SOLANA_DEVNET=1 for deployment.");
  const key = process.env.SOLANA_KEYPAIR_PATH;
  if (!key) throw new Error("SOLANA_KEYPAIR_PATH is required.");
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const c = await createClient()
    .use(signerFromFile(key))
    .use(solanaDevnetRpc({ rpcUrl }));
  if ((await c.rpc.getGenesisHash().send()) !== DEVNET_GENESIS)
    throw new Error("Refusing non-devnet deployment.");
  const bytes = await readFile(
    "programs/competition/target/deploy/formchain_competition.so",
  );
  const rent = await c.rpc
    .getMinimumBalanceForRentExemption(BigInt(bytes.length + 45))
    .send();
  console.log(
    JSON.stringify({
      organizer: c.identity.address,
      balance: String(
        (await c.rpc.getBalance(c.identity.address).send()).value,
      ),
      estimatedDeploymentRent: String(rent),
      binaryBytes: bytes.length,
    }),
  );
  const cli = process.env.SOLANA_CLI || "solana";
  const buffer = ".data/competition-buffer.keypair.json";
  try {
    await readFile(buffer);
  } catch {
    const signer = await generateKeyPairSigner(true);
    const jwk = await crypto.subtle.exportKey("jwk", signer.keyPair.privateKey);
    await writeFile(
      buffer,
      JSON.stringify([
        ...Buffer.from(jwk.d!, "base64url"),
        ...getAddressEncoder().encode(signer.address),
      ]),
      { mode: 0o600, flag: "wx" },
    );
  }

  // Never expose the CLI recovery seed on a failed deployment.
  let output: string;
  try {
    output = execFileSync(
      cli,
      [
        "program",
        "deploy",
        "programs/competition/target/deploy/formchain_competition.so",
        "--program-id",
        "programs/competition/target/deploy/formchain_competition-keypair.json",
        "--buffer",
        process.env.COMPETITION_BUFFER_ADDRESS || buffer,
        "--use-rpc",
        "--keypair",
        key,
        "--url",
        rpcUrl,
        "--max-len",
        String(bytes.length),
        "--output",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000 },
    );
  } catch (e) {
    const msg = String((e as { stderr?: Buffer }).stderr || "");
    console.error(
      msg
        .split("\n")
        .filter((line) => line.startsWith("Error:"))
        .map((line) => line.slice(0, 400))
        .join("\n"),
    );
    throw new Error(
      msg.includes("insufficient") || msg.includes("Insufficient")
        ? "Devnet deployment needs more test SOL; no private recovery output was printed."
        : "Program deployment failed. Inspect safely with the Solana CLI; recovery output withheld.",
    );
  }
  const result = JSON.parse(output);
  const program = result.programId;
  if (!program) throw new Error("Deployment did not return a program ID");
  const env = await readFile(".env.local", "utf8");
  const entry = `NEXT_PUBLIC_COMPETITION_PROGRAM_ID=${program}`;
  await writeFile(
    ".env.local",
    env.includes("NEXT_PUBLIC_COMPETITION_PROGRAM_ID=")
      ? env.replace(/^NEXT_PUBLIC_COMPETITION_PROGRAM_ID=.*$/m, entry)
      : `${env.trimEnd()}\n${entry}\n`,
  );
  console.log(
    JSON.stringify({ program, signature: result.signature, network: "devnet" }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
