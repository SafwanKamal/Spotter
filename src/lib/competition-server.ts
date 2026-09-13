import "server-only";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { address, createSolanaRpc } from "@solana/kit";
import {
  competitionSchema,
  competitionTerms,
  resultsText,
  type CompetitionFeed,
} from "./competitions";
import {
  competitionAddress,
  decodePool,
  digestBytes,
  hex,
} from "./competition-chain";
import { DEVNET_GENESIS } from "./solana-transfer";
export async function competitionFeed(): Promise<CompetitionFeed> {
  let raw: string;
  try {
    raw = await readFile(
      resolve(
        /* turbopackIgnore: true */ process.env.COMPETITIONS_FILE ||
          ".data/competitions.json",
      ),
      "utf8",
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return {
        competitions: [],
        fetchedAt: Date.now(),
        source: "No competitions published yet",
      };
    throw e;
  }
  const competitions = z
    .array(competitionSchema)
    .max(40)
    .parse(JSON.parse(raw));
  const program = process.env.NEXT_PUBLIC_COMPETITION_PROGRAM_ID || null;
  const rpc = createSolanaRpc(
    process.env.SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://api.devnet.solana.com",
  );
  let networkError: string | null = null;
  if (program) {
    try {
      if (
        (await rpc
          .getGenesisHash()
          .send({ abortSignal: AbortSignal.timeout(8000) })) !== DEVNET_GENESIS
      )
        throw new Error("Competition RPC must use devnet.");
    } catch {
      networkError =
        "Solana devnet is unavailable. Funding could not be verified.";
    }
  }
  const items = await Promise.all(
    competitions.map(async (c) => {
      const digest = await digestBytes(competitionTerms(c));
      const base = {
        ...c,
        program,
        termsDigest: hex(digest),
        resultsVerified: null as boolean | null,
        poolAddress: null as string | null,
        chain: null as ReturnType<typeof decodePool> | null,
        balance: null as string | null,
        chainError: networkError,
      };
      if (!program || networkError) return base;
      try {
        base.poolAddress = await competitionAddress(
          address(program),
          address(c.organizer),
          digest,
        );
        const { value } = await rpc
          .getAccountInfo(address(base.poolAddress), {
            encoding: "base64",
            commitment: "confirmed",
          })
          .send({ abortSignal: AbortSignal.timeout(8000) });
        if (!value) return base;
        if (value.owner !== program) {
          if (value.space === 0n) return base;
          throw new Error("Pool owner does not match competition program");
        }
        const state = decodePool(
          new Uint8Array(Buffer.from(value.data[0], "base64")),
        );
        if (
          state.digest !== base.termsDigest ||
          state.organizer !== c.organizer ||
          state.endsAt !== c.endsAt ||
          state.funded !== c.targetLamports
        )
          throw new Error("On-chain terms differ from published competition");
        base.chain = state;
        if (state.finalized)
          base.resultsVerified =
            hex(await digestBytes(resultsText(c))) === state.resultsDigest;
        base.balance = String(value.lamports);
      } catch {
        base.chainError =
          "Pool could not be verified. Try refreshing before transacting.";
      }
      return base;
    }),
  );
  return {
    competitions: items.sort((a, b) => b.updatedAt - a.updatedAt),
    fetchedAt: Date.now(),
    source: competitions.every((c) => c.demo)
      ? "Local demo gym directory · fictional athletes"
      : "Organizer-published gym directory",
  };
}
