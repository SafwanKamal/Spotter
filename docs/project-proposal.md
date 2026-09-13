# Spotter — Project Proposal

**HackWesTX VII · Movement Lab**
*Your gym clip, reviewed. Every rep, on the record.*

This document is the argument for Spotter: why it matters, why it holds together as one
system rather than a pile of integrations, and why it has a business behind it. It is written
to be turned into slides — each section is roughly one.

---

## 1. The one-sentence pitch

**Spotter turns a phone video of your set into reviewable evidence of how you actually
moved — measured on your own device, explained in plain language, replayed in 3D, and
recorded as a participation record a gym or sponsor can verify without ever seeing your
footage.**

---

## 2. The problem

Strength training is the fastest-growing thing people do alone, and the one thing nobody
watches them do.

- **540 million people used fitness apps in 2025**, driving $3.4B in revenue — up 24.5%
  year over year. Nearly all of them log *intentions*: sets, reps, weights you typed in
  yourself. Almost none of them observe *movement*.
- **A coach who would watch costs $40–$100 per hour** at a gym, $100–$175 in-home. The
  feedback that actually changes how you lift is the single most expensive thing in fitness,
  and it is rationed by price.
- **~608,584 resistance-training injuries** reached US emergency departments between 2013
  and 2022. The average patient was **22.8 years old**, and **38.5% of injuries were to the
  trunk**. That is the exact demographic training alone with a phone propped against a water
  bottle.

So the gap is not motivation and it is not tracking. Both are solved markets. The gap is
**observation**: between "I did five squats" and "here is what your fifth squat looked like,
and here is the frame where it changed," there is no product that a normal person can use for
free, in a gym, in ten seconds, without uploading a video of their body to a stranger's server.

That is the gap Spotter fills.

---

## 3. The product

Open the app. Point a camera, or drop in a clip. Spotter:

1. **Recognizes the exercise.** Squat, push-up, lunge, deadlift, or plank — classified from
   the landmark sequence itself, with the user always able to correct it.
2. **Counts and measures.** Complete repetitions, camera-view knee angle over time, lowering
   and rising durations, phase keyframes for every rep, and an explicit "body tracked in X%
   of frames" coverage figure.
3. **Explains.** An AI review grounded in six sampled keyframes plus the measured numbers,
   returning timestamped cues — and its own stated limitations.
4. **Talks while you train.** Live camera mode narrates rule-based cues aloud as you move
   ("Rep 3. Good depth that rep."), generated on-device so the cue lands within a second of
   the moment it describes.
5. **Replays.** A 3D motion viewer plays a canonical, tempo-matched demonstration of the
   movement at your set's actual rhythm, so you can see the shape you were reaching for.
6. **Remembers, and rewards.** Finished live sessions earn capped participation points on a
   real account ledger with leaderboards, and — optionally — a Solana receipt that proves a
   session happened without publishing a single frame of it.

Five destinations, one loop: **Analyze → Replay → Community → Profile → Rewards.**

---

## 4. Why it is coherent

This is the part most hackathon projects cannot claim, and it is our strongest card.

Spotter is not five APIs in a trench coat. It is one spine — **measure, interpret, narrate,
replay, settle** — governed by a single rule:

> **Each layer may only claim what the layer beneath it can prove.**

That rule is visible in every architectural decision:

| Layer | What it does | What it is *not allowed* to claim |
| --- | --- | --- |
| **Measure** (MediaPipe, on-device) | Deterministic 2D joint geometry, rep cycles, coverage | Anatomical depth, joint load, injury risk |
| **Interpret** (Gemini) | Recognition, phase semantics, coaching language | A safety verdict or a calibrated form grade |
| **Narrate** (ElevenLabs) | Short spoken cues from local measurements | Anything the local detector did not measure |
| **Replay** (Kimodo, Three.js) | Canonical tempo-matched demonstration | A reconstruction of *this* athlete's body |
| **Settle** (SQLite ledger, Solana) | Capped participation points, hashed self-claims | Verified form quality or gym attendance time |

Three decisions show this is a design, not a disclaimer:

- **The score ring was deleted.** A prominent percentage "form quality" number tested as the
  most misleading element in the product, so it was removed from the interface and the
  measurement it was based on was demoted to a labeled range-and-tempo rubric. We removed our
  flashiest visual because it claimed more than we could prove.
- **Live cues are local, not LLM.** A coaching cue that arrives two seconds late is worse than
  no cue. So real-time coaching is rule-based from the same measurements that drive rep
  counting, and the cloud model is reserved for post-set review, where latency is free.
  This is an engineering judgment about the physics of the use case, not a tech checkbox.
- **The 3D replay never feeds the score.** Kimodo needs metric 3D joint positions; a single
  phone camera does not measure them. Rather than fabricate constraints from 2D landmarks and
  ship a convincing lie, the replay is labeled a generated demonstration and is walled off
  from every metric and every reward.

**The result:** a judge can poke any part of this system and the answer is already designed in.
That is what coherence buys.

---

## 5. Why it is marketable

### Privacy is not a feature here — it is the cost structure

Video never leaves the device on the local analysis path. Only bounded, opt-in payloads go
out: at most six JPEG keyframes for a review, a compact joint-motion summary for coaching, and
short cue text for speech. Nothing else.

This produces a rare property for an AI product: **marginal cost per analysis is approximately
zero.** Inference runs on the user's phone. Cloud spend is opt-in and capped by construction.
Most AI fitness companies have COGS that scale linearly with engagement — the more their users
love the product, the more it costs them. Ours doesn't. That is a durable structural advantage,
and it is also the compliance story that lets Spotter operate where biometric video of
minors, gym members, and clinic patients is involved.

### Four customers, one engine

| Who | What they get | Why they pay |
| --- | --- | --- |
| **The lifter** | Free local analysis, spoken cues, session history | Coaching feedback at $0 instead of $60/hour |
| **The gym operator** | Participation leaderboards, verified engagement | Retention is the only KPI that matters in fitness; a member with a visible streak stays |
| **The trainer** | A community feed with ranked expertise and AI-annotated examples | Distribution and credibility — a channel to reach members between sessions |
| **The sponsor / insurer** | A verifiable "this person trained" record with no video attached | They already pay for participation. Today they cannot verify it without trusting a self-report |

### Why there is a chain behind Spotter

The rewards layer is not crypto garnish — it is the business model's settlement rail.

The valuable asset Spotter produces is a **portable, verifiable participation record**. A
gym, a sponsor-funded challenge, or a corporate wellness program needs to confirm that a
session happened, without trusting the app vendor and without receiving the member's video.
A hashed on-chain claim does exactly that: the public memo carries a SHA-256 digest, the
exercise name, rep count, and duration — no frames, no landmarks, no coaching text, no raw
score. The evidence stays on the athlete's device; only the commitment goes on the record.

We also drew the anti-cheat line where it actually is: **points come only from live camera
sessions**, never uploaded clips, because an uploaded playback can be reused or taken from
someone else. Points are capped, score-independent, and rate-limited by a daily transaction.

### The competitive position

| | Rep counters (Strong, Hevy) | Cloud form-check apps | Personal trainer | **Spotter** |
| --- | --- | --- | --- | --- |
| Observes actual movement | ✗ | ✓ | ✓ | ✓ |
| Video stays on device | n/a | ✗ | ✓ | ✓ |
| Real-time spoken cues | ✗ | ✗ | ✓ | ✓ |
| Marginal cost per session | ~$0 | high | $40–$100 | ~$0 |
| Verifiable participation record | ✗ | ✗ | ✗ | ✓ |

---

## 6. What is actually built and verified

Everything below is recorded evidence from the build, not aspiration.

**Measurement**
- A real 14.4-second front-squat clip: the original detector counted **1 rep**; the corrected
  upright-relative detector counts **5**, with bottoms at 1.40 / 4.20 / 6.87 / 9.67 / 12.67 s.
- Pose model selected by benchmark, not default: **Lite at 23.05 ms mean inference, 100%
  coverage, 0.002 s mean bottom error**, versus Full (29.56 ms) and Heavy (85.67 ms, 83.7%
  coverage).

**Interpretation and voice**
- Live Gemini 3.8 Flash request returned **HTTP 200 with schema-valid JSON**: squat, high
  confidence, two conservative cues, and two explicit self-stated limitations.
- ElevenLabs Flash v2.5 verified end-to-end with a live MP3 response.

**3D replay**
- Live NVIDIA L4 generation went from **~120 s to ~3.1 s uncached and 0.04 s cached** after
  diagnosing that a package-path collision was forcing a full checkpoint reload on every job.
  **12 sequential live jobs** ran without a queue failure.

**On-chain**
- Public Solana devnet transfer **finalized on Explorer** (signature `MJJVoJP3…mSJJ5`),
  recipient delta exactly 1,000,000 lamports.
- Reward core: HMAC attestation bound to one wallet, wallet-signed redemption, and **replay
  rejection returning HTTP 409**, executed against an in-memory validator.

**The product around it**
- Real participation ledger in SQLite with weekly/monthly/all-time periods, exercise filters,
  search, tie ranks, pagination, and a 200-point daily cap enforced inside a transaction.
- Optional Auth0 Universal Login — the app stays fully usable without an account.
- **43+ unit tests, Python worker tests, clean lint, clean typecheck, clean production build,
  and 9–11 Chrome end-to-end workflows**, including a WCAG A/AA scan with no violations and no
  horizontal overflow at 390 px.

**And we refactored our own design system mid-event**

| | Before | After |
| --- | --- | --- |
| Rendered font sizes | 31 | 10 |
| Spacing values | 40 | a 4px grid |
| Corner radii | 14 | 5 |
| Card treatments | 5 | 2 |

---

## 7. The demo (5 minutes)

1. **0:00 — The hook.** Drop in the front-squat clip. The old detector said one rep. Watch it
   find five, and scrub to the bottom of rep three.
2. **1:00 — The evidence.** Rep tabs, the knee-angle timeline with shaded rep intervals, the
   phase contact sheet, and "body tracked in 100% of frames." Point out that the video has not
   left the browser.
3. **2:00 — The review.** AI coaching returns timestamped cues *and* its own limitations.
   Press **Hear this review**.
4. **3:00 — Live camera.** Do three squats on stage. Cues speak as the reps complete.
5. **3:45 — Replay.** Generate the 3D demonstration at the set's own tempo. Say out loud that
   it is a demonstration, not a reconstruction — and why we refused to fake that.
6. **4:15 — The record.** Points post to the leaderboard; open the Explorer-finalized devnet
   receipt and show that it contains a hash, not a body.

---

## 8. The three questions judges will ask

**"Isn't this just a rep counter?"**
Rep counting is the floor, not the product. The product is *reviewable evidence* — the specific
frame, the specific interval, the specific measurement, and an explanation that points at them.
Counting is how we earn the right to show the rest.

**"Why does this need a blockchain?"**
Because the thing worth selling is a participation record that a gym, sponsor, or insurer can
verify *without trusting us and without seeing the video*. That is precisely a public
commitment to private evidence. And note what we did **not** do: no token, no mainnet, no
video on-chain, and no pretending a self-signed claim is third-party verification.

**"Does your AI actually know good form?"**
No — and we say so, in the interface, in the export, and in the memo. Deterministic geometry
measures; the model interprets and states its uncertainty; neither is allowed to issue a safety
verdict. We deleted our own score ring over this. In a category full of apps confidently
grading bodies, **being the one that tells the truth about what it can see is the position
worth owning.**

---

## 9. What is real, and what is next

**Real today:** five-exercise recognition and measurement, live camera coaching with speech,
AI review, 3D replay on live GPU hardware, account-based participation points and leaderboards,
optional login, and a finalized devnet transaction.

**Next, in order:**
1. Move pose inference off the main thread and validate against labeled clips across more
   people, angles, and body types.
2. Connect the reward core to an authenticated analysis service, a durable store, and auditable
   rotating-QR gym check-in — the three dependencies that turn self-reported points into
   verified ones.
3. Scope one sponsor-funded challenge with an on-chain budget, authorized issuer, and
   single-use claims.
4. Trainer verification, moderation, and consent controls before any real footage is published
   socially.

Honest limits we carry forward: the movement score is an uncalibrated range-and-tempo rubric,
single-camera 3D reconstruction is out of scope, and production anti-cheat is not built. Every
one of those is named in the product itself — which is the point.

---

## 10. The closing line

Fitness software has spent a decade getting very good at counting what you told it you did.
Spotter is built on the opposite premise: **measure what actually happened, say only what you
can prove, and make that proof portable.**

That is a better product. It is also, in a market of 540 million users and confident guesses,
a better business.

---

### Sources

- [Fitness App Revenue and Usage Statistics (2026) — Business of Apps](https://www.businessofapps.com/data/fitness-app-market/)
- [A 10-Year Analysis of Resistance Training–Related Injuries Treated in Emergency Departments — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12688451/)
- [How Much Does a Personal Trainer Cost? (2026 Rates) — Lessons.com](https://lessons.com/costs/personal-trainer-cost)
- Internal: `.codex/PROJECT_LEDGER.md`, `README.md`, `docs/design-audit.md`,
  `docs/health-product-design-research.md`, `docs/pose-model-benchmark.md`
