"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Analysis } from "@/lib/analysis";
import type { ExerciseId } from "@/lib/exercises/types";
import { saveSessionRecord } from "@/lib/local-db";

const STORAGE_KEY = "formchain.latestAnalysis.v1";
export const HISTORY_STORAGE_KEY = "formchain.sessionHistory.v1";
const HISTORY_LIMIT = 30;
const HISTORY_EXERCISES = new Set<ExerciseId>([
  "squat",
  "pushup",
  "lunge",
  "deadlift",
  "plank",
]);
const HISTORY_SOURCES = new Set(["video", "synthetic", "live"]);

export type SessionHistoryEntry = {
  id: string;
  loggedAt: string;
  exercise: ExerciseId;
  source: "video" | "synthetic" | "live";
  duration: number;
  repCount: number;
  movementScore: number | null;
  topCue: string | null;
  points: number;
};

type AnalysisSession = {
  analysis: Analysis | null;
  ready: boolean;
  setAnalysis: (analysis: Analysis | null) => void;
  history: SessionHistoryEntry[];
  /** Logs a session to this device's history and its local database.
   * Returns the generated id so a caller can attach follow-up data (like
   * coaching notes that arrive after the fact) to the same record. */
  logSession: (analysis: Analysis) => string;
};

const AnalysisSessionContext = createContext<AnalysisSession | null>(null);

function isStoredAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object") return false;
  const analysis = value as Partial<Analysis>;
  return (
    analysis.version === 2 &&
    analysis.exercise === "squat" &&
    (analysis.source === "video" || analysis.source === "synthetic") &&
    typeof analysis.duration === "number" &&
    Number.isFinite(analysis.duration) &&
    analysis.duration > 0 &&
    typeof analysis.coverage === "number" &&
    Number.isFinite(analysis.coverage) &&
    Array.isArray(analysis.reps) &&
    Array.isArray(analysis.measurements) &&
    Array.isArray(analysis.cues)
  );
}

function isStoredHistoryEntry(value: unknown): value is SessionHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<SessionHistoryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.loggedAt === "string" &&
    !Number.isNaN(Date.parse(entry.loggedAt)) &&
    typeof entry.exercise === "string" &&
    HISTORY_EXERCISES.has(entry.exercise) &&
    typeof entry.source === "string" &&
    HISTORY_SOURCES.has(entry.source) &&
    typeof entry.duration === "number" &&
    Number.isFinite(entry.duration) &&
    typeof entry.repCount === "number" &&
    Number.isFinite(entry.repCount) &&
    (entry.movementScore === null || typeof entry.movementScore === "number") &&
    (entry.topCue === null || typeof entry.topCue === "string") &&
    typeof entry.points === "number"
  );
}

function estimateReflectionPoints(analysis: Analysis): number {
  const participation = 10;
  const repPoints = Math.min(analysis.reps.length, 20) * 2;
  return Math.min(60, participation + repPoints);
}

function makeSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toHistoryEntry(analysis: Analysis, id: string): SessionHistoryEntry {
  return {
    id,
    loggedAt: new Date().toISOString(),
    exercise: analysis.exercise,
    source: analysis.source,
    duration: analysis.duration,
    repCount: analysis.reps.length,
    movementScore: analysis.movementScore,
    topCue: analysis.cues[0] ?? null,
    points: estimateReflectionPoints(analysis),
  };
}

export function AnalysisSessionProvider({ children }: { children: ReactNode }) {
  const [analysis, setStoredAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<SessionHistoryEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const hydrate = () => {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (active && isStoredAnalysis(parsed)) setStoredAnalysis(parsed);
          else if (!isStoredAnalysis(parsed))
            sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
      try {
        const rawHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (rawHistory) {
          const parsed: unknown = JSON.parse(rawHistory);
          if (Array.isArray(parsed)) {
            const valid = parsed.filter(isStoredHistoryEntry);
            if (active) setHistory(valid);
            if (valid.length !== parsed.length)
              localStorage.setItem(
                HISTORY_STORAGE_KEY,
                JSON.stringify(valid),
              );
          } else {
            localStorage.removeItem(HISTORY_STORAGE_KEY);
          }
        }
      } catch {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
      } finally {
        if (active) setReady(true);
      }
    };
    queueMicrotask(hydrate);
    return () => {
      active = false;
    };
  }, []);

  const setAnalysis = useCallback((next: Analysis | null) => {
    setStoredAnalysis(next);
    if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const logSession = useCallback((analysis: Analysis) => {
    const id = makeSessionId();
    const entry = toHistoryEntry(analysis, id);
    setHistory((previous) => {
      const next = [entry, ...previous].slice(0, HISTORY_LIMIT);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Best-effort persistence only; the in-memory list still updates.
      }
      return next;
    });
    void saveSessionRecord({
      id,
      loggedAt: entry.loggedAt,
      exercise: analysis.exercise,
      source: analysis.source,
      duration: analysis.duration,
      repCount: analysis.reps.length,
      movementScore: analysis.movementScore,
      cues: analysis.cues,
      coachingSummary: null,
    });
    return id;
  }, []);

  const value = useMemo(
    () => ({ analysis, ready, setAnalysis, history, logSession }),
    [analysis, ready, setAnalysis, history, logSession],
  );

  return (
    <AnalysisSessionContext.Provider value={value}>
      {children}
    </AnalysisSessionContext.Provider>
  );
}

export function useAnalysisSession() {
  const value = useContext(AnalysisSessionContext);
  if (!value)
    throw new Error("useAnalysisSession must be used inside its provider.");
  return value;
}
