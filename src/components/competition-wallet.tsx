"use client";
import { Arrow } from "@/components/ui/arrow";
import { useState } from "react";
import { address } from "@solana/kit";
import {
  useWallets,
  useConnect,
  useConnectedWallet,
  useDisconnect,
} from "@solana/kit-plugin-wallet/react";
import { solanaClient } from "@/lib/solana-client";
import { DEVNET_GENESIS } from "@/lib/solana-transfer";
import {
  claimInstruction,
  competitionAddress,
  digestBytes,
  finalizeInstruction,
  fundInstruction,
  sol,
} from "@/lib/competition-chain";
import {
  competitionTerms,
  ranked,
  resultsText,
  type CompetitionView,
} from "@/lib/competitions";
import { useCompetitions } from "./competition-provider";
import { Button } from "./ui/button";
import { Select } from "./ui/field";
export default function CompetitionWallet({
  competition: c,
}: {
  competition: CompetitionView;
}) {
  const wallets = useWallets(solanaClient),
    connected = useConnectedWallet(solanaClient),
    connect = useConnect(solanaClient),
    disconnect = useDisconnect(solanaClient);
  const { refresh, feed } = useCompetitions();
  const [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [signature, setSignature] = useState("");
  const organizer = connected?.account.address === c.organizer;
  const rank = c.chain?.winners.indexOf(connected?.account.address || "") ?? -1;
  const ended = (feed?.fetchedAt || 0) / 1000 >= c.endsAt;
  const winners = ranked(c).slice(0, 3);
  async function transact(kind: "fund" | "finalize" | "claim") {
    setBusy(true);
    setError("");
    setSignature("");
    try {
      if (!c.program || !connected)
        throw new Error(
          "Connect a wallet after the competition program is configured.",
        );
      if ((await solanaClient.rpc.getGenesisHash().send()) !== DEVNET_GENESIS)
        throw new Error("Switch to Solana devnet.");
      const program = address(c.program),
        digest = await digestBytes(competitionTerms(c)),
        pool = await competitionAddress(program, address(c.organizer), digest);
      const ix =
        kind === "fund"
          ? fundInstruction(
              program,
              solanaClient.identity,
              pool,
              digest,
              c.endsAt,
              BigInt(c.targetLamports),
            )
          : kind === "finalize"
            ? finalizeInstruction(
                program,
                solanaClient.identity,
                pool,
                winners.map((w) => w.wallet),
                await digestBytes(resultsText(c)),
              )
            : claimInstruction(program, solanaClient.identity, pool, rank);
      const result = await solanaClient.sendTransaction(ix);
      setSignature(String(result.context.signature));
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The transaction did not complete.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (c.chain?.finalized && c.chain.claimed === 7) {
    return (
      <section className="competition-wallet">
        <h2>Payouts complete</h2>
        <p>
          All three winners have claimed their shares. The full{" "}
          {sol(c.chain.funded)} SOL prize pool has been paid out on devnet.
        </p>
        <p>
          Each prize was released once to its finalized wallet. The pool account
          retains the claim records.
        </p>
      </section>
    );
  }
  return (
    <section
      className="competition-wallet"
      aria-label="Competition wallet actions"
    >
      <h2>{c.chain?.finalized ? "Claim your prize" : "Pool & settlement"}</h2>
      {!c.program ? (
        <p>
          The competition program is not configured on devnet. Funding and
          claims are unavailable.
        </p>
      ) : null}
      <p>
        Devnet test SOL only. The organizer reviews results; the program
        enforces the prize split and one claim per winner.
      </p>
      {connected ? (
        <>
          <p className="reward-wallet">
            Connected: {connected.account.address}
          </p>
          <Button
            variant="link"
            disabled={busy}
            onClick={() => disconnect.dispatch()}
          >
            Disconnect
          </Button>
          {organizer && !c.chain ? (
            <>
              <p>
                Fund the fixed {sol(c.targetLamports)} SOL prize pool, plus
                account rent and transaction fees. Funds remain locked for the
                winners; this prototype has no cancellation or refund action.
              </p>
              <Button
                disabled={busy || !c.program || Boolean(c.chainError) || ended}
                onClick={() => void transact("fund")}
              >
                {busy ? "Waiting for wallet…" : "Fund competition pool"}
              </Button>
              {ended ? (
                <p>
                  This unfunded competition has ended. Publish a new competition
                  to fund another pool.
                </p>
              ) : null}
            </>
          ) : null}
          {organizer && c.chain && !c.chain.finalized ? (
            <>
              <p>
                Finalize once after closing. The reviewed top three shown above
                will receive 50%, 30%, and 20%. This result cannot be edited
                afterward.
              </p>
              <Button
                disabled={
                  busy ||
                  !ended ||
                  winners.length !== 3 ||
                  Boolean(c.chainError)
                }
                onClick={() => void transact("finalize")}
              >
                {busy
                  ? "Waiting for wallet…"
                  : ended
                    ? "Finalize reviewed winners"
                    : "Finalization opens after closing"}
              </Button>
            </>
          ) : null}
          {c.chain?.finalized && rank >= 0 ? (
            <Button
              disabled={
                busy ||
                Boolean(c.chain.claimed & (1 << rank)) ||
                Boolean(c.chainError)
              }
              onClick={() => void transact("claim")}
            >
              {busy
                ? "Waiting for wallet…"
                : c.chain.claimed & (1 << rank)
                  ? "Prize already claimed"
                  : "Claim prize to your wallet"}
            </Button>
          ) : null}
          {!organizer && !(c.chain?.finalized && rank >= 0) ? (
            <p>
              {c.chain?.finalized
                ? "This wallet is not one of the finalized winners."
                : "Standings are provisional. Winner claims open after the organizer finalizes results."}
            </p>
          ) : null}
        </>
      ) : wallets.length ? (
        <div className="wallet-fields">
          <label>
            Wallet
            <Select value={selected} onValueChange={setSelected}>
              <option value="">Choose a wallet</option>
              {wallets.map((w) => (
                <option key={w.name}>{w.name}</option>
              ))}
            </Select>
          </label>
          <Button
            disabled={!selected || connect.isRunning}
            onClick={() => {
              const w = wallets.find((w) => w.name === selected);
              if (w) connect.dispatch(w);
            }}
          >
            Connect wallet
          </Button>
        </div>
      ) : (
        <p>
          Open in a Solana-compatible wallet browser to fund a pool or claim a
          prize.
        </p>
      )}
      {connect.error || disconnect.error ? (
        <p role="alert">Wallet connection failed. Please try again.</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {signature ? (
        <p role="status">
          Transaction confirmed.{" "}
          <a
            href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            View receipt <Arrow />
          </a>
        </p>
      ) : null}
    </section>
  );
}
