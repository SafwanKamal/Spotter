"use client";

import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/field";
import { SOCIAL_POSTS } from "@/lib/social";

type TrainerRow = {
  id: string;
  name: string;
  specialty: string;
  rank: number;
  upvotes: number;
  tips: number;
};

function buildTrainerRows(): TrainerRow[] {
  const byHandle = new Map<
    string,
    { name: string; specialty: string; upvotes: number; tips: number }
  >();

  for (const post of SOCIAL_POSTS) {
    const key = post.trainer.handle;
    const current = byHandle.get(key);
    if (current) {
      current.upvotes += post.baseVotes;
      current.tips += 1;
    } else {
      byHandle.set(key, {
        name: post.trainer.name,
        specialty: post.trainer.specialty,
        upvotes: post.baseVotes,
        tips: 1,
      });
    }
  }

  const sorted = [...byHandle.entries()].sort(
    (a, b) => b[1].upvotes - a[1].upvotes || a[1].name.localeCompare(b[1].name),
  );

  let lastVotes = Number.NaN;
  let lastRank = 0;
  return sorted.map(([id, row], index) => {
    if (row.upvotes !== lastVotes) {
      lastRank = index + 1;
      lastVotes = row.upvotes;
    }
    return {
      id,
      name: row.name,
      specialty: row.specialty,
      rank: lastRank,
      upvotes: row.upvotes,
      tips: row.tips,
    };
  });
}

export default function TrainerLeaderboard() {
  const [search, setSearch] = useState("");
  const trainers = useMemo(() => buildTrainerRows(), []);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return trainers;
    return trainers.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.specialty.toLowerCase().includes(query),
    );
  }, [search, trainers]);

  return (
    <section className="reward-leaderboard" aria-label="Trainer leaderboard">
      <div className="leaderboard-heading">
        <div>
          <p className="overline">DEMO TRAINERS</p>
          <h2>Trainer leaderboard</h2>
          <p>
            Ranked by community upvotes on demo tips. Equal upvotes share a
            rank.
          </p>
        </div>
      </div>
      <div className="leaderboard-controls">
        <label>
          Find a trainer
          <Input
            type="search"
            maxLength={60}
            value={search}
            placeholder="Search trainer name"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="leaderboard-stats">
        <div>
          <strong>{trainers.length}</strong>
          <span>Demo trainers</span>
        </div>
        <div>
          <strong>
            {trainers.reduce((sum, row) => sum + row.upvotes, 0).toLocaleString()}
          </strong>
          <span>Total upvotes</span>
        </div>
        <div>
          <strong>
            {trainers.reduce((sum, row) => sum + row.tips, 0)}
          </strong>
          <span>Tips shared</span>
        </div>
        <div>
          <strong>{filtered.length}</strong>
          <span>Showing</span>
        </div>
      </div>
      {filtered.length ? (
        <div className="leaderboard-table-wrap">
          <table className="leaderboard-table">
            <caption className="sr-only">
              Demo trainers ranked by community upvotes; equal upvotes share a
              rank.
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Trainer</th>
                <th scope="col">Upvotes</th>
                <th scope="col">Tips</th>
                <th scope="col">Specialty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="reward-rank">{row.rank}</td>
                  <th scope="row">{row.name}</th>
                  <td>
                    <strong>{row.upvotes.toLocaleString()}</strong>
                  </td>
                  <td>{row.tips}</td>
                  <td>{row.specialty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="leaderboard-empty">
          <h3>No trainers match your search</h3>
          <p>Try another name or clear the search.</p>
          <Button variant="quiet" onClick={() => setSearch("")}>
            Clear search
          </Button>
        </div>
      )}
    </section>
  );
}
