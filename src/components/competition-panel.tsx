"use client";
import { Arrow } from "@/components/ui/arrow";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCompetitions } from "./competition-provider";
import { phase, ranked } from "@/lib/competitions";
import { sol } from "@/lib/competition-chain";
import { Button } from "./ui/button";
function Listings() {
  const { feed, error, refresh } = useCompetitions();
  const pathname = usePathname();
  return (
    <>
      <div className="competition-panel-heading">
        <div>
          <span className="competition-eyebrow">Around the gym</span>
          <h2>Competitions</h2>
        </div>
        <Button
          variant="link"
          onClick={() => void refresh()}
          aria-label="Refresh competitions"
        >
          ↻
        </Button>
      </div>
      <p className="competition-caption">
        {feed?.source || "Loading gym competitions…"}
      </p>
      {error ? (
        <p role="alert" className="competition-caption">
          {error}
        </p>
      ) : null}
      {feed?.competitions.length === 0 ? (
        <p>No competitions published yet.</p>
      ) : null}
      <div className="competition-list">
        {feed?.competitions.map((c) => {
          const href = `/profile/competitions/${c.id}`;
          const leader = ranked(c)[0];
          return (
            <Link
              className="competition-preview"
              key={c.id}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              <div className="competition-preview-meta">
                <span>
                  {c.chain?.finalized
                    ? "Results final"
                    : phase(c, feed!.fetchedAt / 1000)}
                </span>
                {c.demo ? <span>Demo · devnet</span> : <span>Devnet</span>}
              </div>
              <h3>{c.title}</h3>
              <p>{c.gym}</p>
              <div className="competition-preview-pool">
                <strong>
                  {c.chainError ? "—" : sol(c.chain?.funded || "0")}
                </strong>
                <span> SOL funded</span>
              </div>
              <p>
                {c.chainError
                  ? "Funding unavailable"
                  : !c.chain
                    ? `${sol(c.targetLamports)} SOL target · awaiting sponsor`
                    : c.chain.finalized
                      ? c.chain.claimed === 7
                        ? "All three prizes paid"
                        : "Winner claims are open"
                      : "50% / 30% / 20% to the top three"}
              </p>
              <div className="competition-preview-footer">
                <span>
                  {c.chain?.finalized
                    ? "Final standings"
                    : leader
                      ? `${leader.name.split(" ")[0]} leads · ${leader.score} reps`
                      : "Entries opening soon"}
                </span>
                <Arrow />
              </div>
            </Link>
          );
        })}
      </div>
      {feed ? (
        <p className="competition-caption">
          Checked{" "}
          {new Date(feed.fetchedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · refreshes every 30s
        </p>
      ) : null}
    </>
  );
}
export default function CompetitionPanel() {
  return (
    <aside className="competition-sidebar" aria-label="Gym competitions">
      <div className="competition-sidebar-desktop">
        <Listings />
      </div>
      <details className="competition-sidebar-mobile">
        <summary>
          Gym competitions{" "}
          <span>
            Explore pools & standings <Arrow />
          </span>
        </summary>
        <Listings />
      </details>
    </aside>
  );
}
