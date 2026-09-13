"use client";
import { Arrow } from "@/components/ui/arrow";
import dynamic from "next/dynamic";
import { useCompetitions } from "./competition-provider";
import { awards, sol } from "@/lib/competition-chain";
import { phase, ranked } from "@/lib/competitions";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
const Wallet = dynamic(() => import("./competition-wallet"), {
  ssr: false,
  loading: () => <p>Loading wallet controls…</p>,
});
export default function CompetitionWorkspace({ id }: { id: string }) {
  const { feed, error, refresh } = useCompetitions();
  const c = feed?.competitions.find((c) => c.id === id);
  if (!feed)
    return (
      <div className="page-shell">
        <h1>Competitions</h1>
        <p role="status">{error || "Loading competitions…"}</p>
        <Button variant="outline" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  if (!c)
    return (
      <div className="page-shell">
        <h1>Competition unavailable</h1>
        <p>This competition has not been published in the gym directory.</p>
      </div>
    );
  const table = c.chain?.finalized
    ? c.chain.winners.map(
        (wallet) =>
          c.competitors.find((p) => p.wallet === wallet) || {
            wallet,
            name: `Athlete ${wallet.slice(0, 6)}`,
            score: null,
            reviewed: true,
          },
      )
    : ranked(c);
  const funded = BigInt(c.chain?.funded || "0"),
    split = awards(funded);
  const paid = c.chain
    ? split.reduce(
        (total, n, i) => total + (c.chain!.claimed & (1 << i) ? n : 0n),
        0n,
      )
    : 0n;
  const end = new Date(c.endsAt * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return (
    <div className="page-shell competition-workspace">
      <header className="page-head">
        <div>
          <span className="competition-eyebrow">{c.gym}</span>
          <h1>{c.title}</h1>
          <p>{c.description}</p>
        </div>
        <span className="competition-status">
          {c.chain?.finalized
            ? "Results final"
            : phase(c, feed.fetchedAt / 1000)}
        </span>
      </header>
      <p className="competition-disclosure">
        {c.demo
          ? "Demonstration competition · fictional gym and athletes · devnet test SOL"
          : "Organizer-published competition · devnet test SOL"}
      </p>
      {error || c.chainError ? (
        <p role="alert">{error || c.chainError}</p>
      ) : null}
      <Card className="competition-pool-card">
        <div>
          <span className="competition-eyebrow">Total funded prize pool</span>
          <p className="competition-pool-value">
            {c.chainError ? "—" : sol(funded)} <span>SOL</span>
          </p>
          <p>
            {c.chain
              ? "Confirmed on Solana devnet"
              : "Awaiting sponsor funding"}{" "}
            · {sol(c.targetLamports)} SOL target
          </p>
        </div>
        <div className="competition-pool-stats">
          <div>
            <span>Available prizes</span>
            <strong>{c.chainError ? "—" : sol(funded - paid)} SOL</strong>
          </div>
          <div>
            <span>Paid to winners</span>
            <strong>{c.chainError ? "—" : sol(paid)} SOL</strong>
          </div>
          <div>
            <span>Closes</span>
            <strong>{end}</strong>
          </div>
        </div>
        {c.poolAddress && c.chain ? (
          <a
            className="competition-chain-link"
            href={`https://explorer.solana.com/address/${c.poolAddress}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            Inspect the pool on Solana <Arrow />
          </a>
        ) : null}
      </Card>
      <Card>
        <div className="competition-section-heading">
          <div>
            <span className="competition-eyebrow">
              {c.chain?.finalized ? "Locked on-chain" : "Reviewed entries"}
            </span>
            <h2>{c.chain?.finalized ? "Final standings" : "Top athletes"}</h2>
          </div>
          <span className="competition-caption">{table.length} athletes</span>
        </div>
        <p className="competition-caption">
          {c.chain?.finalized
            ? "Wallet recipients and prize amounts are locked. Names and rep counts are organizer-published metadata."
            : "Highest reviewed rep count wins. Equal counts use wallet address order. Standings may change until finalization."}
        </p>
        <div className="competition-table-wrap">
          <table className="competition-table">
            <caption className="sr-only">
              Competition standings and{" "}
              {c.chain?.finalized ? "final" : "projected"} payouts
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Athlete</th>
                <th scope="col">Reps</th>
                <th scope="col">
                  {c.chain?.finalized ? "Prize" : "Projected prize"}
                </th>
              </tr>
            </thead>
            <tbody>
              {table.map((p, i) => (
                <tr key={p.wallet}>
                  <td>
                    <span className="competition-rank">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </td>
                  <th scope="row">
                    {p.name}
                    <small>
                      {p.wallet.slice(0, 4)}…{p.wallet.slice(-4)}
                    </small>
                  </th>
                  <td>{p.score ?? "—"}</td>
                  <td>
                    {i < 3 ? (
                      <>
                        <strong>
                          {c.chainError ? "—" : sol(split[i])} SOL
                        </strong>
                        <small>
                          {[50, 30, 20][i]}% ·{" "}
                          {c.chainError
                            ? "Unavailable"
                            : c.chain?.claimed && c.chain.claimed & (1 << i)
                              ? "Claimed"
                              : c.chain?.finalized
                                ? "Claim available"
                                : c.chain
                                  ? "Projected"
                                  : "Unfunded"}
                        </small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {c.chain?.finalized ? (
        <p
          className="competition-caption"
          role={c.resultsVerified === false ? "alert" : undefined}
        >
          {c.resultsVerified
            ? "Verified: published standings match the results digest recorded on Solana."
            : "Published standings changed after finalization. On-chain winner wallets and prize amounts remain authoritative."}
        </p>
      ) : null}
      <Card className="competition-distribution">
        <h2>How the pool reaches the winners</h2>
        <div
          className="competition-split"
          aria-label="Prize split: first place 50%, second place 30%, third place 20%"
        >
          {[50, 30, 20].map((p, i) => (
            <div key={p} style={{ flex: p }}>
              <strong>{p}%</strong>
              <span>#{i + 1}</span>
            </div>
          ))}
        </div>
        <ol>
          <li>
            <strong>Compete & review.</strong> The organizer publishes reviewed
            entries. Uploaded scores do not automatically qualify for money.
          </li>
          <li>
            <strong>Close & finalize.</strong> After {end}, the organizer signs
            the final three wallet recipients. The pool fixes the 50 / 30 / 20
            split.
          </li>
          <li>
            <strong>Claim once.</strong> Each winner signs a claim. Their share
            moves directly from the pool into their wallet; another claim is
            rejected.
          </li>
        </ol>
        <p className="competition-caption">
          Payouts are claimed, not sent automatically at the closing time. The
          organizer is trusted to select valid results. Account rent and network
          fees are separate from the prize pool; no raw video is stored
          on-chain.
        </p>
      </Card>
      <Card>
        <Wallet competition={c} />
      </Card>
      <p className="competition-caption">
        Directory updated {new Date(c.updatedAt * 1000).toLocaleString()}. Chain
        checked {new Date(feed.fetchedAt).toLocaleTimeString()}.{" "}
        <Button variant="link" onClick={() => void refresh()}>
          Refresh now
        </Button>
      </p>
    </div>
  );
}
