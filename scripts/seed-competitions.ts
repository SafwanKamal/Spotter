import { loadEnvConfig } from "@next/env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  createClient,
  generateKeyPairSigner,
  getAddressEncoder,
} from "@solana/kit";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { competitionSchema } from "../src/lib/competitions";
loadEnvConfig(process.cwd());
async function main() {
  await mkdir(".data", { recursive: true });
  try {
    await readFile(".data/competitions.json");
    console.log(
      "Competition directory exists; preserved. Edit it deliberately to publish updates.",
    );
    return;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  async function makeSigner(name: string) {
    const signer = await generateKeyPairSigner(true);
    const privateJwk = await crypto.subtle.exportKey(
      "jwk",
      signer.keyPair.privateKey,
    );
    const bytes = [
      ...Buffer.from(privateJwk.d!, "base64url"),
      ...getAddressEncoder().encode(signer.address),
    ];
    await writeFile(
      `.data/competition-${name}.keypair.json`,
      JSON.stringify(bytes),
      { mode: 0o600, flag: "wx" },
    );
    return signer;
  }
  const organizer = process.env.SOLANA_KEYPAIR_PATH
    ? (
        await createClient().use(
          signerFromFile(process.env.SOLANA_KEYPAIR_PATH),
        )
      ).identity
    : await makeSigner("organizer");
  const players = await Promise.all(
    ["alex", "jordan", "sam", "riley", "casey"].map(makeSigner),
  );
  const now = Math.floor(Date.now() / 1000);
  const entries = [
    {
      id: "west-texas-squat-open",
      title: "West Texas Squat Open",
      gym: "West Texas Strength · demo gym",
      description:
        "One reviewed set, up to 20 reps. Clean participation counts; the AI form score never decides a prize.",
      exercise: "squat",
      startsAt: now - 3600,
      endsAt: now + 86400,
      targetLamports: "10000000",
    },
    {
      id: "weekend-pushup-cup",
      title: "Weekend Push-up Cup",
      gym: "Foundry Fitness · demo gym",
      description:
        "Submit one set for organizer review. The three highest approved rep counts share the pool.",
      exercise: "pushup",
      startsAt: now + 86400,
      endsAt: now + 3 * 86400,
      targetLamports: "20000000",
    },
    {
      id: "community-lunge-finish",
      title: "Community Lunge Final",
      gym: "Movement Club · demo gym",
      description:
        "A short settlement rehearsal: reviewed demonstration athletes, real devnet payout rules.",
      exercise: "lunge",
      startsAt: now - 3600,
      endsAt: now + 180,
      targetLamports: "1000000",
    },
  ];
  const names = [
    "Alex Morgan",
    "Jordan Lee",
    "Sam Rivera",
    "Riley Chen",
    "Casey Park",
  ];
  const result = entries.map((c, i) =>
    competitionSchema.parse({
      ...c,
      organizer: organizer.address,
      demo: true,
      updatedAt: now - i * 60,
      competitors: players.map((p, j) => ({
        name: names[j],
        wallet: p.address,
        score: 20 - j * 2,
        reviewed: true,
      })),
    }),
  );
  await writeFile(".data/competitions.json", JSON.stringify(result, null, 2), {
    flag: "wx",
  });
  console.log(
    "Published three fictional gym competitions. Devnet pool targets are unfunded until a funding transaction confirms. Athlete demo keys are private in .data/.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
