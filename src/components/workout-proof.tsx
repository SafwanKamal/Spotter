"use client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

import { useEffect, useMemo, useState } from "react";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useIsWalletReady,
  useWallets,
} from "@solana/kit-plugin-wallet/react";
import type { Analysis } from "@/lib/analysis";
import { solanaClient } from "@/lib/solana-client";
import {
  createWorkoutClaim,
  createWorkoutMemo,
  devnetExplorerUrl,
  hashWorkoutClaim,
} from "@/lib/workout-proof";

const shortAddress = (value: string) =>
  value.slice(0, 4) + "…" + value.slice(-4);

type DemoStatus =
  | { configured: false; error?: string }
  | {
      configured: true;
      address: string | null;
      lamports: string | null;
      funded: boolean;
      error?: string;
    };

export default function WorkoutProof({ analysis }: { analysis: Analysis }) {
  const wallets = useWallets(solanaClient);
  const connected = useConnectedWallet(solanaClient);
  const ready = useIsWalletReady(solanaClient);
  const connectAction = useConnect(solanaClient);
  const disconnectAction = useDisconnect(solanaClient);
  const [selectedWallet, setSelectedWallet] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signature, setSignature] = useState("");
  const [error, setError] = useState("");
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null);
  const claim = useMemo(() => createWorkoutClaim(analysis), [analysis]);
  const wallet = wallets.find((candidate) => candidate.name === selectedWallet);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/rewards/proof", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as DemoStatus;
        if (!cancelled) setDemoStatus(body);
      })
      .catch(() => {
        if (!cancelled) setDemoStatus({ configured: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitBrowserProof() {
    if (!connected) return;
    setSubmitting(true);
    setError("");
    setSignature("");
    try {
      const digest = await hashWorkoutClaim(claim);
      const memo = createWorkoutMemo(claim, digest);
      const result = await solanaClient.memo.instructions
        .addMemo({ memo })
        .sendTransaction();
      setSignature(String(result.context.signature));
    } catch (reason) {
      const rejected = reason instanceof Error && reason.name === "AbortError";
      setError(
        rejected
          ? "The wallet request was cancelled. Nothing was recorded."
          : "The devnet proof could not be recorded. Check the wallet network and devnet SOL, then try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDemoProof() {
    setSubmitting(true);
    setError("");
    setSignature("");
    try {
      const response = await fetch("/api/rewards/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis: {
            version: analysis.version,
            exercise: analysis.exercise,
            source: analysis.source,
            duration: analysis.duration,
            coverage: analysis.coverage,
            movementScore: analysis.movementScore,
            reps: analysis.reps,
            detection: { algorithm: analysis.detection.algorithm },
          },
        }),
      });
      const body = (await response.json()) as {
        signature?: string;
        error?: string;
      };
      if (!response.ok || !body.signature) {
        throw new Error(
          body.error ||
            "The local demo wallet could not record this proof on devnet.",
        );
      }
      setSignature(body.signature);
      if (demoStatus?.configured) {
        setDemoStatus({
          ...demoStatus,
          funded: true,
        });
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The local demo wallet could not record this proof on devnet.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const demoReady =
    demoStatus?.configured === true &&
    Boolean(demoStatus.address) &&
    !demoStatus.error;
  const demoAddress =
    demoStatus?.configured === true ? demoStatus.address : null;
  const demoFunded =
    demoStatus?.configured === true ? demoStatus.funded : false;

  return (
    <div className="workout-proof">
      <h3>Keep a public receipt</h3>
      <p>
        Your wallet can record a hash of this set on Solana devnet. No video,
        image, or landmark data is included.
      </p>
      {!ready ? (
        <p className="proof-note" role="status">
          Checking for a wallet…
        </p>
      ) : connected ? (
        <>
          <div className="proof-wallet">
            <span>
              {connected.wallet.name} ·{" "}
              {shortAddress(connected.account.address)}
            </span>
            <Button
              variant="link"
              disabled={disconnectAction.isRunning || submitting}
              onClick={() => disconnectAction.dispatch()}
            >
              Disconnect
            </Button>
          </div>
          <Button
            variant="outline"
            disabled={submitting}
            onClick={submitBrowserProof}
          >
            {submitting ? "Recording on devnet…" : "Record devnet proof"}
          </Button>
        </>
      ) : wallets.length ? (
        <>
          <label htmlFor="proof-wallet">Wallet</label>
          <Select
            id="proof-wallet"
            value={selectedWallet}
            placeholder="Choose a wallet"
            onValueChange={setSelectedWallet}
          >
            <option value="">Choose a wallet</option>
            {wallets.map((candidate) => (
              <option key={candidate.name} value={candidate.name}>
                {candidate.name}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            disabled={!wallet || connectAction.isRunning}
            onClick={() => wallet && connectAction.dispatch(wallet)}
          >
            {connectAction.isRunning ? "Connecting…" : "Connect devnet wallet"}
          </Button>
        </>
      ) : (
        <p className="proof-note">
          No compatible browser wallet was found.
          {demoReady
            ? " You can still record with the configured local demo keypair."
            : " Your movement review is still complete."}
        </p>
      )}
      {demoReady && demoAddress && !connected && (
        <div className="proof-demo">
          <div className="proof-wallet">
            <span>Local demo keypair · {shortAddress(demoAddress)}</span>
            <span className="proof-note">
              {demoFunded ? "Funded on devnet" : "Needs a small faucet top-up"}
            </span>
          </div>
          <Button
            variant="outline"
            disabled={submitting || !demoFunded}
            onClick={submitDemoProof}
          >
            {submitting
              ? "Recording with demo keypair…"
              : "Record with local demo keypair"}
          </Button>
          {!demoFunded && (
            <p className="proof-note">
              Fund{" "}
              <a
                href="https://faucet.solana.com"
                target="_blank"
                rel="noreferrer"
              >
                {demoAddress}
              </a>{" "}
              on Solana devnet, then refresh this page.
            </p>
          )}
        </div>
      )}
      {Boolean(connectAction.error || disconnectAction.error) && (
        <p className="message error" role="alert">
          The wallet connection did not complete. Try again from your wallet.
        </p>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {signature && (
        <p className="proof-success" role="status">
          Proof recorded.{" "}
          <a
            href={devnetExplorerUrl(signature)}
            target="_blank"
            rel="noreferrer"
          >
            View on Solana Explorer
          </a>
        </p>
      )}
      <small>
        This is a wallet-signed self-claim, not verified attendance or reward
        eligibility. It spends a small devnet transaction fee; no tokens are
        issued. The local demo keypair stays server-side and must never be
        committed or deployed publicly.
      </small>
    </div>
  );
}
