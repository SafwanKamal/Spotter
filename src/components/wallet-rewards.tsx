"use client";
import { useState } from "react";
import { address } from "@solana/kit";
import {
  useWallets,
  useConnect,
  useConnectedWallet,
  useDisconnect,
} from "@solana/kit-plugin-wallet/react";
import { solanaClient } from "@/lib/solana-client";
import { DEVNET_GENESIS, parseSolAmount } from "@/lib/solana-transfer";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/field";
export default function WalletRewards() {
  const wallets = useWallets(solanaClient),
    connected = useConnectedWallet(solanaClient),
    connect = useConnect(solanaClient),
    disconnect = useDisconnect(solanaClient);
  const [wallet, setWallet] = useState(""),
    [recipient, setRecipient] = useState(""),
    [amount, setAmount] = useState("0.001"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [signature, setSignature] = useState("");
  async function transfer() {
    if (!connected) return;
    setBusy(true);
    setError("");
    setSignature("");
    try {
      const destination = address(recipient.trim()),
        lamports = parseSolAmount(amount);
      if (destination === connected.account.address)
        throw new Error("Choose a different recipient wallet.");
      if ((await solanaClient.rpc.getGenesisHash().send()) !== DEVNET_GENESIS)
        throw new Error("This feature only supports Solana devnet.");
      const result = await solanaClient.system.instructions
        .transferSol({
          source: solanaClient.identity,
          destination,
          amount: lamports,
        })
        .sendTransaction();
      setSignature(String(result.context.signature));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Transfer did not complete. Check your wallet and devnet balance.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Wallet</h2>
      <p>
        Connect your own wallet to send test SOL to another wallet on Solana
        devnet. Participation points stay in Spotter; this transfer spends
        your wallet’s test SOL.
      </p>
      {connected ? (
        <>
          <p>
            Connected:{" "}
            <span className="reward-wallet">{connected.account.address}</span>
          </p>
          <Button
            variant="link"
            disabled={busy}
            onClick={() => disconnect.dispatch()}
          >
            Disconnect wallet
          </Button>
          <div className="wallet-fields">
            <label>
              Recipient wallet
              <Input
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setSignature("");
                }}
                placeholder="Solana address"
                disabled={busy}
              />
            </label>
            <label>
              Amount (devnet SOL)
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setSignature("");
                }}
                disabled={busy}
              />
            </label>
          </div>
          <p>
            Your wallet will ask you to approve {amount} devnet SOL plus the
            network fee.
          </p>
          <Button
            variant="outline"
            disabled={busy || !recipient || Boolean(signature)}
            onClick={transfer}
          >
            {busy
              ? "Waiting for wallet and network…"
              : "Review transfer in wallet"}
          </Button>
        </>
      ) : wallets.length ? (
        <div className="wallet-fields">
          <label>
            Wallet
            <Select
              aria-label="Wallet"
              value={wallet}
              onValueChange={setWallet}
            >
              <option value="">Choose wallet</option>
              {wallets.map((w) => (
                <option key={w.name}>{w.name}</option>
              ))}
            </Select>
          </label>
          <Button
            variant="outline"
            disabled={!wallet || connect.isRunning}
            onClick={() => {
              const selected = wallets.find((w) => w.name === wallet);
              if (selected) connect.dispatch(selected);
            }}
          >
            Connect wallet
          </Button>
        </div>
      ) : (
        <p className="proof-note">
          Open this page with a Solana-compatible browser wallet to connect.
        </p>
      )}
      {Boolean(connect.error || disconnect.error) && (
        <p role="alert">
          Wallet connection did not complete. Please try again.
        </p>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {signature && (
        <p role="status">
          Transfer submitted.{" "}
          <a
            href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction on Explorer
          </a>
        </p>
      )}
    </section>
  );
}
