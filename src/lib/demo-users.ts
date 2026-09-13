import type { ExerciseId } from "./exercises/types";
import {
  ParticipationStore,
  type BoardFilters,
  type Participation,
} from "./participation-store";

/** Local-only fictional roster used to exercise ranking, search, and history. */
export const DEMO_VIEWER_ID = "dev|auth-disabled";
export const DEMO_E2E_ID = "auth0|spotter-e2e";

export const SESSION_HISTORY_STORAGE_KEY = "spotter.sessionHistory.v1";
export const PROFILE_STORAGE_KEY = "spotter.profile.v1";

export type DemoAthlete = { id: string; name: string };

export const DEMO_ATHLETES: DemoAthlete[] = [
  { id: DEMO_VIEWER_ID, name: "Dev Mode" },
  { id: DEMO_E2E_ID, name: "Test Athlete" },
  { id: "demo|priya-raman", name: "Priya Raman" },
  { id: "demo|jordan-blake", name: "Jordan Blake" },
  { id: "demo|sam-okonkwo", name: "Sam Okonkwo" },
  { id: "demo|riley-nguyen", name: "Riley Nguyen" },
  { id: "demo|casey-holt", name: "Casey Holt" },
  { id: "demo|morgan-ellis", name: "Morgan Ellis" },
  { id: "demo|avery-kim", name: "Avery Kim" },
  { id: "demo|quinn-patel", name: "Quinn Patel" },
  { id: "demo|rowan-diaz", name: "Rowan Diaz" },
  { id: "demo|harper-singh", name: "Harper Singh" },
  { id: "demo|cameron-walsh", name: "Cameron Walsh" },
  { id: "demo|sage-okada", name: "Sage Okada" },
  { id: "demo|reese-alvarez", name: "Reese Alvarez" },
  { id: "demo|drew-fontaine", name: "Drew Fontaine" },
  { id: "demo|parker-solis", name: "Parker Solis" },
  { id: "demo|hayden-brooks", name: "Hayden Brooks" },
  { id: "demo|logan-chen", name: "Logan Chen" },
  { id: "demo|niko-barrett", name: "Niko Barrett" },
  { id: "demo|elena-voss", name: "Elena Voss" },
  { id: "demo|micah-torres", name: "Micah Torres" },
  { id: "demo|sasha-ibarra", name: "Sasha Ibarra" },
  { id: "demo|jules-romero", name: "Jules Romero" },
  { id: "demo|dana-whitaker", name: "Dana Whitaker" },
  { id: "demo|kai-mendoza", name: "Kai Mendoza" },
];

export const ALL_BOARD_FILTERS: BoardFilters = {
  period: "all",
  exercise: "all",
  search: "",
  page: 1,
};

type SessionSpec = {
  athleteId: string;
  exercise: ExerciseId;
  reps: number;
  daysAgo: number;
};

const SESSION_SPECS: SessionSpec[] = [
  { athleteId: "demo|priya-raman", exercise: "squat", reps: 12, daysAgo: 0 },
  { athleteId: "demo|priya-raman", exercise: "pushup", reps: 10, daysAgo: 1 },
  { athleteId: "demo|priya-raman", exercise: "lunge", reps: 8, daysAgo: 3 },
  { athleteId: "demo|priya-raman", exercise: "deadlift", reps: 6, daysAgo: 10 },
  { athleteId: DEMO_VIEWER_ID, exercise: "squat", reps: 5, daysAgo: 0 },
  { athleteId: DEMO_VIEWER_ID, exercise: "plank", reps: 0, daysAgo: 2 },
  { athleteId: DEMO_VIEWER_ID, exercise: "pushup", reps: 6, daysAgo: 18 },
  { athleteId: DEMO_E2E_ID, exercise: "lunge", reps: 7, daysAgo: 1 },
  { athleteId: DEMO_E2E_ID, exercise: "squat", reps: 4, daysAgo: 4 },
  { athleteId: "demo|jordan-blake", exercise: "deadlift", reps: 9, daysAgo: 0 },
  { athleteId: "demo|sam-okonkwo", exercise: "deadlift", reps: 9, daysAgo: 0 },
  { athleteId: "demo|riley-nguyen", exercise: "pushup", reps: 8, daysAgo: 2 },
  { athleteId: "demo|casey-holt", exercise: "squat", reps: 6, daysAgo: 5 },
  { athleteId: "demo|morgan-ellis", exercise: "lunge", reps: 5, daysAgo: 6 },
  { athleteId: "demo|avery-kim", exercise: "plank", reps: 0, daysAgo: 1 },
  { athleteId: "demo|quinn-patel", exercise: "squat", reps: 3, daysAgo: 8 },
  { athleteId: "demo|rowan-diaz", exercise: "pushup", reps: 4, daysAgo: 9 },
  { athleteId: "demo|harper-singh", exercise: "deadlift", reps: 5, daysAgo: 11 },
  { athleteId: "demo|cameron-walsh", exercise: "lunge", reps: 4, daysAgo: 12 },
  { athleteId: "demo|sage-okada", exercise: "squat", reps: 8, daysAgo: 20 },
  { athleteId: "demo|reese-alvarez", exercise: "pushup", reps: 7, daysAgo: 22 },
  { athleteId: "demo|drew-fontaine", exercise: "plank", reps: 0, daysAgo: 25 },
  { athleteId: "demo|parker-solis", exercise: "lunge", reps: 6, daysAgo: 28 },
  { athleteId: "demo|hayden-brooks", exercise: "deadlift", reps: 4, daysAgo: 30 },
  { athleteId: "demo|logan-chen", exercise: "squat", reps: 2, daysAgo: 2 },
  { athleteId: "demo|niko-barrett", exercise: "pushup", reps: 3, daysAgo: 4 },
  { athleteId: "demo|elena-voss", exercise: "lunge", reps: 2, daysAgo: 7 },
  { athleteId: "demo|micah-torres", exercise: "plank", reps: 0, daysAgo: 3 },
  { athleteId: "demo|sasha-ibarra", exercise: "squat", reps: 1, daysAgo: 15 },
  { athleteId: "demo|jules-romero", exercise: "deadlift", reps: 3, daysAgo: 16 },
  { athleteId: "demo|dana-whitaker", exercise: "pushup", reps: 2, daysAgo: 19 },
  { athleteId: "demo|kai-mendoza", exercise: "lunge", reps: 1, daysAgo: 21 },
];

export type DemoLocalHistoryEntry = {
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

export type DemoLocalProfile = {
  version: 1;
  name: string;
  focus: string;
};

function participationFor(
  spec: SessionSpec,
  uniqueness: number,
): Participation {
  const coverage = 0.82 + ((uniqueness % 12) / 100);
  if (spec.exercise === "plank") {
    return {
      source: "live",
      exercise: "plank",
      duration: 30 + uniqueness,
      coverage,
      reps: [],
    };
  }
  const reps = Array.from({ length: spec.reps }, (_, index) => ({
    start: 1 + index * 3,
    end: 3 + index * 3,
  }));
  const lastEnd = reps.at(-1)?.end ?? 3;
  return {
    source: "live",
    exercise: spec.exercise,
    duration: lastEnd + 2 + uniqueness,
    coverage,
    reps,
  };
}

function athleteName(id: string) {
  const athlete = DEMO_ATHLETES.find((entry) => entry.id === id);
  if (!athlete) throw new Error(`Unknown demo athlete: ${id}`);
  return athlete.name;
}

export function demoParticipationClaims(now = Date.now()) {
  return SESSION_SPECS.map((spec, index) => ({
    athleteId: spec.athleteId,
    name: athleteName(spec.athleteId),
    created: now - spec.daysAgo * 86_400_000 - index * 1_000,
    input: participationFor(spec, index),
  }));
}

export function seedDemoParticipation(
  store: ParticipationStore,
  now = Date.now(),
) {
  let awarded = 0;
  let skipped = 0;
  for (const claim of demoParticipationClaims(now)) {
    const result = store.claim(
      claim.athleteId,
      claim.name,
      claim.input,
      claim.created,
    );
    if (result.alreadyClaimed) skipped += 1;
    else awarded += result.awardedPoints;
  }
  return {
    athletes: DEMO_ATHLETES.length,
    sessions: SESSION_SPECS.length,
    awarded,
    skipped,
  };
}

const LOCAL_CUES: Record<ExerciseId, string> = {
  squat: "Brace before you chase depth.",
  pushup: "Keep the elbows tracking, not flaring.",
  lunge: "Front heel stays planted through the descent.",
  deadlift: "Push the floor away before the bar leaves it.",
  plank: "Keep the hips in line with shoulders and ankles.",
};

export function demoLocalHistory(now = Date.now()): DemoLocalHistoryEntry[] {
  return [
    {
      id: "demo-local-squat",
      loggedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      exercise: "squat",
      source: "live",
      duration: 46,
      repCount: 5,
      movementScore: 84,
      topCue: LOCAL_CUES.squat,
      points: 20,
    },
    {
      id: "demo-local-pushup",
      loggedAt: new Date(now - 1 * 86_400_000).toISOString(),
      exercise: "pushup",
      source: "video",
      duration: 38,
      repCount: 8,
      movementScore: 76,
      topCue: LOCAL_CUES.pushup,
      points: 26,
    },
    {
      id: "demo-local-lunge",
      loggedAt: new Date(now - 3 * 86_400_000).toISOString(),
      exercise: "lunge",
      source: "synthetic",
      duration: 41,
      repCount: 6,
      movementScore: 71,
      topCue: LOCAL_CUES.lunge,
      points: 22,
    },
    {
      id: "demo-local-plank",
      loggedAt: new Date(now - 12 * 86_400_000).toISOString(),
      exercise: "plank",
      source: "live",
      duration: 40,
      repCount: 0,
      movementScore: 68,
      topCue: LOCAL_CUES.plank,
      points: 10,
    },
  ];
}

export const DEMO_LOCAL_PROFILE: DemoLocalProfile = {
  version: 1,
  name: "Dev Mode",
  focus: "Improve technique",
};

export function demoLeaderboard(
  viewerId: string | null = DEMO_VIEWER_ID,
  filters: BoardFilters = ALL_BOARD_FILTERS,
  now = Date.now(),
) {
  const store = new ParticipationStore(":memory:");
  try {
    seedDemoParticipation(store, now);
    return {
      ...store.board(viewerId, filters, now),
      history: viewerId ? store.history(viewerId) : [],
      signedIn: Boolean(viewerId),
    };
  } finally {
    store.db.close();
  }
}
