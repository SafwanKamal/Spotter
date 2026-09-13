"use client";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "./ui/button";
import { Input, Select } from "./ui/field";
import { RankingPreview } from "./ranking-preview";
type Entry = {
  id: string;
  name: string;
  rank: number;
  points: number;
  sessions: number;
  repetitions: number;
  activeDays: number;
  isYou: boolean;
};
type Board = {
  entries: Entry[];
  me: Entry | null;
  total: number;
  totalPoints: number;
  matching: number;
  pages: number;
  page: number;
  updatedAt: number;
  history: { exercise: string; points: number; created: number }[];
};
export default function RewardLeaderboard({
  refreshKey = 0,
  account = false,
  preview = false,
}: {
  refreshKey?: number;
  account?: boolean;
  preview?: boolean;
}) {
  const [period, setPeriod] = useState("week"),
    [exercise, setExercise] = useState("all"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0);
  const [data, setData] = useState<Board | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const refresh = () => setReload((n) => n + 1);
    window.addEventListener("rewards-updated", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("rewards-updated", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(
          "/api/rewards/leaderboard?" +
            new URLSearchParams({
              period,
              exercise,
              search,
              page: String(page),
            }),
          { signal: controller.signal, cache: "no-store" },
        );
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load ranking.");
        if (!controller.signal.aborted) setData(d);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load ranking.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [period, exercise, search, page, refreshKey, reload]);

  if (preview) {
    return (
      <RankingPreview
        title="Community leaderboard"
        entries={(data?.entries ?? []).slice(0, 3).map((entry) => ({
          name: entry.name,
          detail: `${entry.points.toLocaleString()} points`,
        }))}
        href="/social/leaderboard?ranking=athletes"
        emptyMessage={loading ? "Loading rankings…" : "No athletes have recorded a session yet."}
      />
    );
  }

  return (
    <section
      className="reward-leaderboard"
      aria-label={account ? "Your rewards" : "Community leaderboard"}
    >
      <div className="leaderboard-heading">
        <div>
          <p className="overline">SHOWING UP COUNTS</p>
          <h2>{account ? "Your progress" : "Community leaderboard"}</h2>
          <p>
            Build consistency, one set at a time. Rankings use participation
            points from recorded sessions.
          </p>
        </div>
        <Button
          variant="quiet"
          onClick={() => setReload((n) => n + 1)}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>
      <div className="leaderboard-controls">
        <div className="segmented" aria-label="Ranking period">
          {[
            ["week", "This week"],
            ["month", "This month"],
            ["all", "All time"],
          ].map(([value, label]) => (
            <Button
              key={value}
              variant="unstyled"
              className={period === value ? "selected" : undefined}
              aria-pressed={period === value}
              onClick={() => {
                setPeriod(value);
                setPage(1);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <label>
          Exercise
          <Select
            aria-label="Exercise"
            value={exercise}
            onValueChange={(value) => {
              setExercise(value);
              setPage(1);
            }}
          >
            {["all", "squat", "pushup", "lunge", "deadlift", "plank"].map(
              (x) => (
                <option key={x} value={x}>
                  {x === "all"
                    ? "All exercises"
                    : x === "pushup"
                      ? "Push-up"
                      : x.charAt(0).toUpperCase() + x.slice(1)}
                </option>
              ),
            )}
          </Select>
        </label>
        <label>
          Find an athlete
          <Input
            type="search"
            maxLength={60}
            value={search}
            placeholder="Search athlete name"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="message error">
          {error}{" "}
          <Button variant="link" onClick={() => setReload((n) => n + 1)}>
            Try again
          </Button>
        </p>
      ) : (
        <div aria-busy={loading}>
          {loading && <p role="status">Updating ranking…</p>}
          {data && (
            <>
              <div className="leaderboard-stats">
                <div>
                  <strong>{data.me ? `#${data.me.rank}` : "—"}</strong>
                  <span>Your rank</span>
                </div>
                <div>
                  <strong>{data.me?.points ?? 0}</strong>
                  <span>Your points</span>
                </div>
                <div>
                  <strong>{data.total}</strong>
                  <span>Active athletes</span>
                </div>
                <div>
                  <strong>{data.me?.activeDays ?? 0}</strong>
                  <span>Your active days</span>
                </div>
              </div>
              {data.me && (
                <p className="leaderboard-you">
                  You are <strong>{data.me.name}</strong> · {data.me.sessions}{" "}
                  sets · {data.me.repetitions} repetitions
                </p>
              )}
              {data.entries.length ? (
                <div className="leaderboard-table-wrap">
                  <table className="leaderboard-table">
                    <caption className="sr-only">
                      Athletes ranked by participation points; equal points
                      share a rank.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Rank</th>
                        <th scope="col">Athlete</th>
                        <th scope="col">Points</th>
                        <th scope="col">Sets</th>
                        <th scope="col">Active days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map((r) => (
                        <tr
                          key={r.id}
                          className={r.isYou ? "is-you" : undefined}
                        >
                          <td className="reward-rank">{r.rank}</td>
                          <th scope="row">
                            {r.name}
                            {r.isYou ? " · You" : ""}
                          </th>
                          <td>
                            <strong>{r.points.toLocaleString()}</strong>
                          </td>
                          <td>{r.sessions}</td>
                          <td>{r.activeDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="leaderboard-empty">
                  <h3>
                    {search
                      ? "No athletes match your search"
                      : "Be the first to show up"}
                  </h3>
                  <p>
                    {search
                      ? "Try another name or clear the search."
                      : "Record a workout and collect your session points to join this ranking."}
                  </p>
                  <ButtonLink href="/analyze" variant="outline">
                    Analyze a set
                  </ButtonLink>
                </div>
              )}
              {data.pages > 1 && (
                <div className="leaderboard-heading">
                  <Button
                    variant="quiet"
                    disabled={data.page <= 1 || loading}
                    onClick={() => setPage(data.page - 1)}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {data.page} of {data.pages}
                  </span>
                  <Button
                    variant="quiet"
                    disabled={data.page >= data.pages || loading}
                    onClick={() => setPage(data.page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
              {account && data.history.length > 0 && (
                <div>
                  <h3>Recent points</h3>
                  <ul className="reward-rank-list">
                    {data.history.map((h, i) => (
                      <li key={i}>
                        <span>
                          {h.exercise}
                          {" · "}
                          {new Date(h.created).toLocaleDateString()}
                        </span>
                        <strong>+{h.points} pts</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
