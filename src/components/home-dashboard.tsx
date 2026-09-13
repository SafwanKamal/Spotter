"use client";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  useAnalysisSession,
  type SessionHistoryEntry,
} from "@/components/analysis-session";

const WEEKLY_GOAL = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

// A rough estimate for a bodyweight strength set at moderate effort (about
// 5 METs at an assumed ~70kg bodyweight) — a ballpark for motivation, not a
// clinical measurement.
const CALORIES_PER_MINUTE = 6.5;

type ActivityPeriod = "today" | "week" | "month";

const ACTIVITY_PERIODS: { key: ActivityPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

function isSameLocalDay(iso: string, now: number) {
  const then = new Date(Date.parse(iso));
  const today = new Date(now);
  return (
    then.getFullYear() === today.getFullYear() &&
    then.getMonth() === today.getMonth() &&
    then.getDate() === today.getDate()
  );
}

function formatExerciseTime(totalSeconds: number) {
  if (totalSeconds <= 0) return "0m";
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function greetingForHour(hour: number) {
  if (hour < 5) return "Good night.";
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

function formatRelativeTime(iso: string, now: number) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffMs = Math.max(0, now - then);
  const minute = 60_000,
    hour = 60 * minute,
    day = 24 * hour;
  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 2 * day) return "Yesterday";
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const SESSION_TITLES: Record<SessionHistoryEntry["exercise"], string> = {
  squat: "Squat session",
  pushup: "Push-up session",
  lunge: "Lunge session",
  deadlift: "Deadlift session",
  plank: "Plank session",
};

function sessionTitle(exercise: SessionHistoryEntry["exercise"]) {
  return SESSION_TITLES[exercise] ?? `${exercise} session`;
}

function formTag(score: number | null) {
  if (score === null) return { text: "Awaiting a full read", tone: "muted" };
  if (score >= 85) return { text: "Strong, steady depth", tone: "good" };
  if (score >= 70) return { text: "Good control, minor drift", tone: "good" };
  return { text: "Room to tighten form", tone: "watch" };
}

function ReflectionThumb() {
  return (
    <svg viewBox="0 0 64 64" className="reflection-thumb" aria-hidden="true">
      <defs>
        <linearGradient id="reflectionGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-soft)" />
          <stop offset="1" stopColor="var(--accent-bright)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#reflectionGradient)" />
      <path
        d="M14 42 C 22 42, 22 24, 30 24 S 38 40, 46 40 S 50 22, 52 20"
        fill="none"
        stroke="var(--illustration-on-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProgressRing({
  completed,
  goal,
}: {
  completed: number;
  goal: number;
}) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const fraction = goal > 0 ? Math.min(1, completed / goal) : 0;
  const offset = circumference * (1 - fraction);
  return (
    <svg viewBox="0 0 74 74" className="progress-ring" aria-hidden="true">
      <circle cx="37" cy="37" r={radius} className="progress-ring-track" />
      <circle
        cx="37"
        cy="37"
        r={radius}
        className="progress-ring-fill"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 37 37)"
      />
      <text x="37" y="42" textAnchor="middle" className="progress-ring-label">
        {completed}/{goal}
      </text>
    </svg>
  );
}

function ReflectionRow({
  entry,
  now,
}: {
  entry: SessionHistoryEntry;
  now: number;
}) {
  const tag = formTag(entry.movementScore);
  return (
    <li className="reflection-card">
      <ReflectionThumb />
      <div className="reflection-body">
        <div className="reflection-heading">
          <span className="reflection-title">
            {sessionTitle(entry.exercise)}
          </span>
          <span className="reflection-time">
            {formatRelativeTime(entry.loggedAt, now)}
          </span>
        </div>
        <p className={`reflection-tag reflection-tag-${tag.tone}`}>
          {tag.text}
        </p>
        <p className="reflection-note">
          {entry.topCue ??
            "Nice work — no specific coaching notes were flagged for this set."}
        </p>
        <p className="reflection-meta">
          {entry.repCount} reps · {Math.round(entry.duration)}s
        </p>
      </div>
    </li>
  );
}

export default function HomeDashboard() {
  const { history, ready } = useAnalysisSession();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    queueMicrotask(() => {
      setMounted(true);
      setNow(Date.now());
    });
  }, []);

  const weeklyCount = useMemo(() => {
    if (!now) return 0;
    return history.filter(
      (entry) => now - Date.parse(entry.loggedAt) <= WEEK_MS,
    ).length;
  }, [history, now]);

  const [period, setPeriod] = useState<ActivityPeriod>("week");

  const activityStats = useMemo(() => {
    if (!now) return { sessionCount: 0, totalSeconds: 0, estCalories: 0 };
    const inPeriod = history.filter((entry) => {
      if (period === "today") return isSameLocalDay(entry.loggedAt, now);
      const span = period === "week" ? WEEK_MS : MONTH_MS;
      return now - Date.parse(entry.loggedAt) <= span;
    });
    const totalSeconds = inPeriod.reduce(
      (sum, entry) => sum + entry.duration,
      0,
    );
    return {
      sessionCount: inPeriod.length,
      totalSeconds,
      estCalories: (totalSeconds / 60) * CALORIES_PER_MINUTE,
    };
  }, [history, now, period]);

  const remaining = Math.max(0, WEEKLY_GOAL - weeklyCount);
  const heroHeading =
    weeklyCount === 0
      ? "Let's start the week."
      : remaining === 0
        ? "Weekly rhythm complete."
        : "Steady practice.";
  const heroBody =
    weeklyCount === 0
      ? "Record a check-in to begin this week's practice."
      : remaining === 0
        ? `${weeklyCount} sessions logged — you've hit your weekly rhythm.`
        : `${weeklyCount} session${weeklyCount === 1 ? "" : "s"} logged, ${remaining} to go for your weekly rhythm.`;

  const showLoading = !mounted || !ready;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-day">
            {mounted
              ? new Date().toLocaleDateString(undefined, { weekday: "long" })
              : " "}
          </p>
          <h1 className="dashboard-greeting">
            {mounted ? greetingForHour(new Date().getHours()) : " "}
          </h1>
        </div>
        <Link
          href="/profile"
          className="dashboard-avatar"
          aria-label="Open profile"
        />
      </header>

      <Card variant="hero" aria-label="Weekly progress">
        {showLoading ? (
          <div className="progress-ring progress-ring-placeholder" />
        ) : (
          <ProgressRing completed={weeklyCount} goal={WEEKLY_GOAL} />
        )}
        <div className="hero-copy">
          <p className="overline hero-overline">THIS WEEK</p>
          <h2>{showLoading ? "Loading your week." : heroHeading}</h2>
          <p>{showLoading ? "Fetching your recent sessions." : heroBody}</p>
        </div>
      </Card>

      <section className="activity" aria-label="Your activity">
        <div className="activity-header">
          <p className="overline activity-label">YOUR ACTIVITY</p>
          <div
            className="activity-tabs"
            role="tablist"
            aria-label="Choose a time period"
          >
            {ACTIVITY_PERIODS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={period === key}
                className={
                  period === key ? "activity-tab active" : "activity-tab"
                }
                onClick={() => setPeriod(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="activity-grid">
          <div className="activity-stat">
            <strong>{showLoading ? "—" : activityStats.sessionCount}</strong>
            <span>sessions</span>
          </div>
          <div className="activity-stat">
            <strong>
              {showLoading ? "—" : formatExerciseTime(activityStats.totalSeconds)}
            </strong>
            <span>exercise time</span>
          </div>
          <div className="activity-stat">
            <strong>
              {showLoading ? "—" : Math.round(activityStats.estCalories)}
            </strong>
            <span>calories (est.)</span>
          </div>
        </div>
      </section>

      <Card variant="cta">
        <div>
          <h2>Ready for a check-in?</h2>
          <p>Record a set and let AI reflect it back to you.</p>
        </div>
        <ButtonLink variant="cta" href="/analyze">
          Record
        </ButtonLink>
      </Card>

      <section className="reflections" aria-label="Recent reflections">
        <p className="overline reflections-label">RECENT REFLECTIONS</p>
        {showLoading ? (
          <p className="reflections-empty">Loading your history.</p>
        ) : history.length === 0 ? (
          <p className="reflections-empty">
            No reflections yet — record your first check-in above.
          </p>
        ) : (
          <ul className="reflections-list">
            {history.slice(0, 5).map((entry) => (
              <ReflectionRow entry={entry} now={now} key={entry.id} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
