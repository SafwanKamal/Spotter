import "client-only";
import {systemProgram} from "@solana-program/system";

import { createClient } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { memoProgram } from "@solana-program/memo";

const rpcUrl =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export const solanaClient = createClient()
  .use(
    walletSigner({
      chain: "solana:devnet",
      storageKey: "formchain:devnet-wallet",
    }),
  )
  .use(solanaRpc({ rpcUrl }))
  .use(memoProgram()).use(systemProgram());

export type SolanaClient = typeof solanaClient;
