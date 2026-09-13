import { z } from "zod";
import { isAddress } from "@solana/kit";
import type { PoolState } from "./competition-chain";
const wallet = z.string().refine(isAddress);
export const competitorSchema = z.object({ name: z.string().min(1).max(60), wallet, score: z.number().int().min(0).max(10000), reviewed: z.boolean() });
export const competitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/), title: z.string().min(1).max(100), gym: z.string().min(1).max(80),
  description: z.string().max(400), exercise: z.enum(["squat","pushup","lunge","deadlift","plank"]),
  startsAt: z.number().int().positive(), endsAt: z.number().int().positive(), targetLamports: z.string().regex(/^\d+$/).refine(v => BigInt(v)>0n && BigInt(v)<=1_000_000_000n),
  organizer: wallet, demo: z.boolean(), updatedAt: z.number().int().positive(), competitors: z.array(competitorSchema).max(200),
}).refine(c=>c.endsAt>c.startsAt,"End must follow start").refine(c=>new Set(c.competitors.map(p=>p.wallet)).size===c.competitors.length,"Duplicate wallet");
export type Competition = z.infer<typeof competitionSchema>;
export type CompetitionView = Competition & { program: string | null; poolAddress: string | null; chain: PoolState | null; chainError: string | null; balance: string | null; termsDigest: string };
export type CompetitionFeed = { competitions: CompetitionView[]; fetchedAt: number; source: string };
export function ranked(c: Competition) { return c.competitors.filter(p=>p.reviewed).sort((a,b)=>b.score-a.score || a.wallet.localeCompare(b.wallet)); }
// Fixed terms are hashed into the PDA; editing these creates a different pool.
export function competitionTerms(c: Competition) { return JSON.stringify({ version:1, id:c.id, title:c.title, gym:c.gym, exercise:c.exercise, startsAt:c.startsAt, endsAt:c.endsAt, targetLamports:c.targetLamports, organizer:c.organizer, demo:c.demo, ranking:"reviewed-reps-desc-wallet-asc", split:[50,30,20] }); }
export function resultsText(c: Competition) { return JSON.stringify(ranked(c).map(({wallet,score})=>({wallet,score}))); }
export function phase(c: Competition, now = Date.now()/1000) { return now < c.startsAt ? "Upcoming" : now < c.endsAt ? "Open" : "Ended"; }
