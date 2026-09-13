"use client";
import { Button } from "@/components/ui/button";
import { Arrow } from "@/components/ui/arrow";
import { Select } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { RankingPreview } from "@/components/ranking-preview";

import Link from "next/link";
import RewardLeaderboard from "./reward-leaderboard";
import { useEffect, useMemo, useState } from "react";
import {
  rankSocialPosts,
  SOCIAL_POSTS,
  totalVotes,
  type SocialExercise,
  type SocialSort,
} from "@/lib/social";
import styles from "@/app/(app)/social/social.module.css";

const STORAGE_KEY = "spotter.socialVotes.v1";
const exercises: Array<"All" | SocialExercise> = [
  "All",
  "Squat",
  "Deadlift",
  "Mobility",
];

function readVotes() {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return new Set<string>();
    const validIds = new Set(SOCIAL_POSTS.map((post) => post.id));
    return new Set(
      parsed.filter(
        (value): value is string =>
          typeof value === "string" && validIds.has(value),
      ),
    );
  } catch {
    return new Set<string>();
  }
}

export default function SocialFeed() {
  const [sort, setSort] = useState<SocialSort>("trending");
  const [exercise, setExercise] = useState<"All" | SocialExercise>("All");
  const [votes, setVotes] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setVotes(readVotes());
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const posts = useMemo(() => {
    const filtered =
      exercise === "All"
        ? SOCIAL_POSTS
        : SOCIAL_POSTS.filter((post) => post.exercise === exercise);
    return rankSocialPosts(filtered, sort, votes);
  }, [exercise, sort, votes]);

  function toggleVote(postId: string) {
    setVotes((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <div className={styles.page}>
      <header className={`page-head ${styles.hero}`}>
        <div>
          <h1>Community</h1>
          <p>
            Trainer-led clips and practical cues. Demo content for now.
          </p>
        </div>
        <Link className={styles.shareAction} href="/analyze">
          Analyze your set
          <Arrow />
        </Link>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.sortTabs} aria-label="Sort community posts">
          {(["trending", "top", "latest"] as SocialSort[]).map((option) => (
            <Button
              variant="unstyled"
              key={option}
              type="button"
              className={sort === option ? styles.activeTab : undefined}
              aria-pressed={sort === option}
              onClick={() => setSort(option)}
            >
              {option === "top"
                ? "Top tips"
                : option[0].toUpperCase() + option.slice(1)}
            </Button>
          ))}
        </div>
        <label className={styles.filter}>
          <span>Exercise</span>
          <Select
            aria-label="Filter by exercise"
            value={exercise}
            onValueChange={(next) => setExercise(next as typeof exercise)}
          >
            {exercises.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </Select>
        </label>
      </div>

      <div className={styles.communityLayout}>
        <section className={styles.feed} aria-label="Trainer tips">
          {posts.map((post, index) => {
            const voted = votes.has(post.id);
            return (
              <Card
                variant="custom"
                as="article"
                className={styles.post}
                key={post.id}
              >
                <header className={styles.postHeader}>
                  <div className={styles.avatar} aria-hidden="true">
                    {post.trainer.initials}
                  </div>
                  <div>
                    <strong>{post.trainer.name}</strong>
                    <span>
                      {post.trainer.handle} · {post.trainer.specialty}
                    </span>
                  </div>
                  <span className={styles.demoBadge}>Demo profile</span>
                </header>

                <div className={styles.clipPreview}>
                  <div>
                    <span>TRAINER CLIP · {post.duration}</span>
                    <strong>{post.exercise}</strong>
                  </div>
                  <span className={styles.playIcon} aria-hidden="true">
                    ▶
                  </span>
                  <span className={styles.rank}>#{index + 1}</span>
                </div>

                <div className={styles.postBody}>
                  <p className={styles.exerciseLabel}>{post.exercise}</p>
                  <h2>{post.title}</h2>
                  <p className={styles.caption}>{post.caption}</p>
                  <div className={styles.coachTip}>
                    <span>COACH&apos;S REVIEW TIP</span>
                    <p>{post.tip}</p>
                  </div>
                </div>

                <footer className={styles.postActions}>
                  <Button
                    variant="unstyled"
                    type="button"
                    className={voted ? styles.voted : undefined}
                    aria-pressed={voted}
                    aria-label={`${voted ? "Remove upvote from" : "Upvote"} ${post.title}`}
                    disabled={!ready}
                    onClick={() => toggleVote(post.id)}
                  >
                    <span aria-hidden="true">↑</span>
                    {totalVotes(post, votes)}
                  </Button>
                </footer>
              </Card>
            );
          })}
        </section>

        <aside className={styles.sidebar}>
          <RewardLeaderboard preview />
          <RankingPreview
            title="Top demo trainers"
            entries={SOCIAL_POSTS.map((post) => ({
              name: post.trainer.name,
              detail: post.trainer.specialty,
            }))}
            href="/social/leaderboard?ranking=trainers"
          />
          <section>
            <h2>Reward useful context.</h2>
            <p>
              Upvote clear demonstrations and specific cues. Avoid appearance
              judgments, diagnoses, unsafe challenges, and claims that one
              camera angle cannot support.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
