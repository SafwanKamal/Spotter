import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { z } from "zod";

export const participationSchema = z
  .object({
    source: z.literal("live"),
    exercise: z.enum(["squat", "pushup", "lunge", "deadlift", "plank"]),
    duration: z.number().min(3).max(600),
    coverage: z.number().min(0.75).max(1),
    reps: z
      .array(
        z.object({
          start: z.number().nonnegative(),
          end: z.number().positive(),
        }),
      )
      .max(100),
  })
  .superRefine((v, ctx) => {
    if (v.exercise !== "plank" && !v.reps.length)
      ctx.addIssue({
        code: "custom",
        message: "Complete at least one repetition.",
      });
    if (
      v.reps.some(
        (r, i) =>
          r.end <= r.start ||
          r.end > v.duration ||
          (i > 0 && r.start < v.reps[i - 1].end),
      )
    )
      ctx.addIssue({ code: "custom", message: "Invalid repetition timing." });
  });
export type Participation = z.infer<typeof participationSchema>;
export type BoardFilters = {
  period: "week" | "month" | "all";
  exercise: string;
  search: string;
  page: number;
};
export class ParticipationStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS athletes(id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS participation(id INTEGER PRIMARY KEY, athlete TEXT NOT NULL, digest TEXT NOT NULL, exercise TEXT NOT NULL, reps INTEGER NOT NULL, points INTEGER NOT NULL, created INTEGER NOT NULL, UNIQUE(athlete,digest));
      CREATE INDEX IF NOT EXISTS participation_date ON participation(created,exercise);`);
  }
  claim(athlete: string, name: string, raw: unknown, now = Date.now()) {
    const input = participationSchema.parse(raw);
    const digest = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const points = 10 + Math.min(input.reps.length, 20) * 2;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db
        .prepare(
          "SELECT points FROM participation WHERE athlete=? AND digest=?",
        )
        .get(athlete, digest);
      if (previous) {
        this.db.exec("COMMIT");
        return { awardedPoints: 0, alreadyClaimed: true };
      }
      const day = Math.floor(now / 86400000) * 86400000;
      const total = this.db
        .prepare(
          "SELECT COALESCE(SUM(points),0) AS total FROM participation WHERE athlete=? AND created>=?",
        )
        .get(athlete, day) as { total: number };
      if (total.total + points > 200)
        throw new Error(
          "Daily limit of 200 participation points reached. Try again tomorrow (UTC).",
        );
      this.db
        .prepare(
          "INSERT INTO athletes VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name",
        )
        .run(athlete, name.slice(0, 60));
      this.db
        .prepare(
          "INSERT INTO participation(athlete,digest,exercise,reps,points,created) VALUES (?,?,?,?,?,?)",
        )
        .run(athlete, digest, input.exercise, input.reps.length, points, now);
      this.db.exec("COMMIT");
      return { awardedPoints: points, alreadyClaimed: false };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  board(viewer: string | null, filters: BoardFilters, now = Date.now()) {
    const date = new Date(now);
    const start =
      filters.period === "all"
        ? 0
        : filters.period === "month"
          ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
          : Date.UTC(
              date.getUTCFullYear(),
              date.getUTCMonth(),
              date.getUTCDate() - ((date.getUTCDay() + 6) % 7),
            );
    const rows = this.db
      .prepare(
        `SELECT a.id,a.name,SUM(p.points) AS points,COUNT(*) AS sessions,SUM(p.reps) AS repetitions,COUNT(DISTINCT CAST(p.created/86400000 AS INTEGER)) AS activeDays FROM participation p JOIN athletes a ON a.id=p.athlete WHERE p.created>=? AND (?='all' OR p.exercise=?) GROUP BY a.id ORDER BY points DESC,a.id ASC`,
      )
      .all(start, filters.exercise, filters.exercise) as Array<{
      id: string;
      name: string;
      points: number;
      sessions: number;
      repetitions: number;
      activeDays: number;
    }>;
    let rank = 0;
    const ranked = rows.map((row, i) => {
      if (i === 0 || rows[i - 1].points !== row.points) rank = i + 1;
      return {
        ...row, rank, isYou: row.id === viewer,
        id: createHash("sha256").update(row.id).digest("hex").slice(0, 16),
      };
    });
    const matching = ranked.filter((r) =>
      r.name.toLowerCase().includes(filters.search.toLowerCase()),
    );
    const pages = Math.max(1, Math.ceil(matching.length / 20));
    const page = Math.min(filters.page, pages);
    return {
      entries: matching.slice((page - 1) * 20, page * 20),
      me: ranked.find((r) => r.isYou) ?? null,
      total: rows.length,
      matching: matching.length,
      pages,
      page,
      totalPoints: rows.reduce((n, r) => n + r.points, 0),
      period: filters.period,
      updatedAt: now,
    };
  }
  history(athlete: string) {
    return this.db
      .prepare(
        "SELECT exercise,reps,points,created FROM participation WHERE athlete=? ORDER BY created DESC,id DESC LIMIT 20",
      )
      .all(athlete);
  }
}
