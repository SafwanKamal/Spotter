# Spotter — Movement Lab

Canonical repository: [SafwanKamal/Spotter](https://github.com/SafwanKamal/Spotter).

HackWesTX VII prototype. Browser-based squat review: clip upload, MediaPipe landmarks, complete repetitions, knee-angle timeline, phase keyframes, JSON export, an optional server-side Gemini coaching adapter, and a Kimodo-ready 3D motion viewer. The wellbeing redesign and its evidence are documented in [the design research report](docs/health-product-design-research.md).

## Run locally

Use Node.js 22 or later. Development has been checked on Node.js 25.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Development uses webpack by default (`next dev --webpack`) because Turbopack on this Next.js version can panic with `File is not valid JSON … at .` during HMR. Use `npm run dev:turbo` only if you want to re-test Turbopack. Keep a single `next dev` process running and avoid deleting `.next` while it is up.

To populate the local participation leaderboard with a fictional athlete roster (search, filters, pagination, and “your rank”), run:

```sh
npm run seed:demo-users
```

That writes into `.data/rewards.sqlite` (gitignored). Reseeding is idempotent. Browser fixtures in `tests/browser/demo-users.spec.ts` also seed on-device session history and profile for dashboard/profile coverage.

For a real analysis, choose a 3–30 second MP4/H.264 or WebM video under 100 MB, filmed from the side with one person's shoulder, hip, knee, and ankle visible. Begin and end standing. Click **Analyze clip**. The clip stays in browser memory, with no server upload during local analysis. Model assets load from Google storage and jsDelivr; first analysis needs an internet connection. The bounded analysis summary persists in session storage for this browser tab so Replay and Rewards can use it across navigation and refreshes; the original video and keyframe images do not leave Analyze or enter session storage.

## Gemini setup

Create `.env.local` from `.env.example`, then set `GEMINI_API_KEY` and `GEMINI_MODEL` to an image-capable model with structured JSON support enabled for your Google account. Restart the server. Keys remain server-side; do not use a `NEXT_PUBLIC_` prefix.

For the current integration, use `GEMINI_MODEL=gemini-3.8-flash`. A live
six-frame, five-rep request returned schema-valid JSON on 2026-09-12.

After a clip is analyzed, Analyze also derives joint travel, speed, and
acceleration from the on-device landmarks and sends only that compact summary
to a smaller text model (`GEMINI_JOINT_COACH_MODEL`, default
`gemini-3.5-flash-lite`) with an exercise-form playbook. No video, keyframes,
or raw landmarks leave the browser on that path. The result is a coach-voice
note about which joints did the work and which usually lose shape first.

With the local server running, verify the complete five-rep coaching payload:

```bash
RUN_GEMINI_LIVE=1 \
SQUAT_CLIP=/absolute/path/to/clip.mp4 \
PLAYWRIGHT_CHANNEL=chrome \
npm run test:gemini
```

This opt-in command sends six JPEGs—the set start and one bottom frame for each
of the five detected reps—plus the fixture measurements to Google Gemini. It
does not send the original video.

### Pose model benchmark

The app defaults to Google MediaPipe Pose Landmarker Lite. Re-run the
Lite/Full/Heavy CPU comparison on a local clip with:

```bash
SQUAT_CLIP=/absolute/path/to/clip.mp4 \
PLAYWRIGHT_CHANNEL=chrome \
npm run benchmark:pose
```

The supplied five-rep front-squat result and benchmark limitations are recorded
in [`docs/pose-model-benchmark.md`](docs/pose-model-benchmark.md).

After local analysis, **Get Gemini coaching** sends up to six JPEG keyframes and the measured rep summary to the `/api/coach` route and Google. The model returns an exercise label, confidence category, timestamped cues, and limitations. Provider failures leave local results available. Missing configuration returns HTTP 503; invalid input returns 400; input above 2 MB returns 413. A non-squat or uncertain classification hides the displayed movement score. Exports retain provisional local metrics, explicitly marked `exercise: squat`; these are not reward attestations.

The live Gemini path has been verified with the supplied five-rep clip and developer credentials. The public endpoint has no authentication or persistent rate limiting; keep this prototype local until those controls exist.

## Automatic exercise recognition and live camera coaching

Analyze opens directly in automatic detection. It runs MediaPipe once,
classifies the landmark sequence as squat, push-up,
lunge, deadlift, or plank, and routes those same frames into the matching
local analyzer. The result shows its confidence and remains user-correctable;
ambiguous or low-coverage clips explicitly request confirmation. This is an
interpretable five-exercise prototype classifier, not general activity
recognition.

Squat-versus-lunge identification requires visible stance evidence. An upright
torso alone is not treated as a lunge. When a single view hides the feet or the
front and back legs overlap, the app asks the user to confirm the label and
recommends a stable side or 30–45° recording with both feet visible. The current
prototype analyzes one clip from one angle; combining synchronized multiple
angles would require a separate capture and calibration workflow.

Push-ups, lunges, deadlifts, and planks use the same joint-tracking approach relative to
the person's tracked range. AI coaching and Rewards/session history remain
squat-only; the other exercises show local measurements and cues.

**Live camera** runs the same pose model against your camera in real time —
for all five exercises — and narrates short, rule-based coaching cues as you
move (a completed rep's depth and tempo, a plank's hips drifting out of
line, milestone call-outs). These cues are generated locally from the same
measurements that drive rep counting, not by Gemini: a live cue needs to
land within a second or two of the moment it describes, which an LLM round
trip cannot guarantee. Video is processed on your device and never
uploaded; only the short cue text (e.g. "Rep 3. Good depth that rep.") is
sent to ElevenLabs for speech, and only once you configure a voice.

To hear cues spoken aloud, add to `.env.local`:

```
ELEVENLABS_API_KEY=your-key
ELEVENLABS_VOICE_ID=            # optional; defaults to a premade ElevenLabs voice
```

Without a key, Live camera still works — cues appear as text in the
coaching log instead of being spoken. After an uploaded clip is analyzed,
the same voice reads a short recap of the detected exercise, repetition or
hold counts, tracking coverage, and the first local coaching note. Use
**Hear this review** to play it again.

`GET /api/speak` reports whether a key is configured. `POST /api/speak`
synthesizes one short cue through ElevenLabs Flash v2.5 and requires a
signed-in session, matching Gemini coaching. On Analyze → Live camera,
**Hear a sample** plays a representative cue without starting the camera.

An opt-in live check exists: `RUN_ELEVENLABS_LIVE=1 npm run test:elevenlabs`.

## Kimodo motion replay

The Replay workspace includes a Three.js BVH viewer that works without a GPU. Four-second bodyweight and front-squat demonstrations are cached in `public/motion-demos/` and load immediately from **Generate with Kimodo**. Successful live jobs are also stored in the browser and on the worker disk so repeats do not wait on the GPU. You can still choose **Open BVH animation** and import a BVH file under 2 MB. Imported animation is parsed and bounded in the browser before rendering.

Live generation uses the small authenticated adapter in `services/kimodo/worker.py`. Run it on a Linux machine where NVIDIA's `kimodo_gen` CLI, SOMA-RP v1.1 checkpoint, and a supported CUDA GPU are already installed:

```sh
export KIMODO_API_TOKEN='replace-with-a-long-random-secret'
./services/kimodo/start.sh
```

`start.sh` pins `LOCAL_CACHE=true` and `TEXT_ENCODER_MODE=api`, preloads the motion model, and writes deterministic results under `services/kimodo/cache/`. That avoids the previous per-job `kimodo_gen` subprocess, which reloaded checkpoints (and often re-checked Hugging Face) and dominated the ~120 second wait. Restart the remote worker after pulling this change. `python3 services/kimodo/worker.py` still works if you export the same variables yourself.

Set the same secret and the worker's private URL as `KIMODO_API_TOKEN` and `KIMODO_URL` in the web app's `.env.local`, then restart Next.js. The worker listens on `127.0.0.1:8001` by default. If the web app runs elsewhere, expose the worker only through a private authenticated tunnel or TLS reverse proxy; setting `KIMODO_BIND=0.0.0.0` alone is not a secure deployment.

The adapter allows one live job at a time, sends only a selected squat variation and a 2–8 second duration, keeps the motion model warm, and returns a standard-T-pose SOMA77 BVH. Cache hits skip the GPU. After analysis, the requested duration follows the set's median detected rep time with a small start/end buffer, snapped to 0.5 seconds; without analysis it remains four seconds. The worker accepts both current single-output BVH filename conventions.

It never receives the workout video or landmarks. Normalized single-camera MediaPipe points are not converted into Kimodo constraints: Kimodo constraints require skeleton-local rotations or metric, Y-up 3D joint positions, which this app does not measure. Generated output is therefore labeled as a generic tempo-matched demonstration; it does not reconstruct the athlete, prove form quality, or replace the measured review. This local Apple Silicon machine has no NVIDIA GPU, so the live generation path is adapter-tested but not model-executed.

## Solana devnet workout proof

After a real video produces at least one repetition, at least 75% tracking coverage, and the prototype range/tempo metric, the Rewards workspace offers an optional Solana receipt. Wallet Standard discovery uses the current `@solana/kit` stack and is fixed to devnet. The connected wallet pays the small devnet fee and signs a Memo-program transaction.

For local demos without a browser wallet, set `SOLANA_DEMO_PROOF=1` and `SOLANA_KEYPAIR_PATH` to a Solana CLI keypair JSON **outside the repo** (see `.env.example`). The server-only route `POST /api/rewards/proof` signs the same Memo claim with that keypair. The private key never enters the browser and must never be committed or deployed publicly. Fund the derived address on [the Solana faucet](https://faucet.solana.com) before recording.

The public memo includes:

- a SHA-256 digest of the bounded versioned claim;
- exercise name, repetition count, and clip/set duration;
- no video, keyframes, landmarks, coaching text, wallet secret, or raw score.

The private claim committed by the digest contains the analysis/detector versions, tracking coverage, and provisional range/tempo score. The transaction is a wallet-signed **self-claim** only. It does not prove attendance, total time at a gym, correct form, or reward eligibility. Synthetic samples, low-coverage clips, and incomplete sets cannot use the proof control. No token is minted and no production points are issued.

`NEXT_PUBLIC_SOLANA_RPC_URL` can override the public devnet endpoint at build time. Because it is browser-visible, never place a secret-bearing provider URL there.

`npm test` executes the exact Memo instruction with a throwaway signer in an in-memory LiteSVM validator. An optional live smoke test creates a new in-memory signer, requests faucet SOL, and writes an explicitly labeled integration-test memo—not a workout claim:

```sh
npm run test:devnet
```

With a funded keypair file configured, the same script can sign with that wallet and optionally emit a real workout memo shape:

```sh
RUN_SOLANA_DEVNET=1 \
SOLANA_KEYPAIR_PATH=/absolute/path/to/keypair.json \
SOLANA_WORKOUT_MEMO=1 \
npm run test:devnet
```

This performs a public devnet write. The public faucet is rate-limited and may fail independently of the transaction implementation.

### Working integration examples

`/profile/rewards` includes three labeled demo athletes (Alex, Jordan, and Sam). They use the same claim hashing, Memo payload, HMAC attestation, wallet-bound redemption, ranking, and replay rejection as a live squat. **Run local Solana and points demo** executes that path in the app process with throwaway wallets. It does not upload gym footage or write to public Solana devnet.

The same walkthrough also submits each demo memo to an in-memory LiteSVM validator:

```sh
npm run demo:rewards
```

Expected awards under policy v1: Alex 16 points (3 reps), Jordan 26 (8 reps; movement score ignored), Sam 29 (5 reps plus a 45-minute rotating-QR gym visit). Replaying Alex's attestation is rejected.

## Profile and rewards navigation

`/profile` holds a browser-local display name and training focus, optional Auth0 sign-in, account/storage information, and the entry to `/profile/rewards`. Profile replaces Rewards in desktop and mobile navigation; the dashboard avatar also opens it. Daily reflections show workout metadata instead of points. Training focus is descriptive and does not change analysis. Auth0 identifies the account; display name, history, and videos stay in this browser until a later sync path exists.

`/sign-in` and `/sign-up` start Auth0 Universal Login (`/auth/login`, `/auth/login?screen_hint=signup`). The app itself remains usable without an account.

Within Rewards, points remain available while optional Solana receipt controls sit in a collapsed **Workout receipts & wallet** section. Existing `/rewards` URLs redirect to `/profile/rewards`; reward API routes and signing behavior are unchanged.

## Community feed prototype

`/social` demonstrates a trainer-led learning feed with exercise filtering, trending/top/latest sorting, expandable AI-observation panels, and browser-persistent upvotes. All included trainer profiles, rankings, clip placeholders, and AI notes are visibly labeled fictional demo content. Upvotes are stored only in versioned local browser storage and are not global, authenticated, or written to Solana.

Production social features require authenticated users and trainer verification, a durable database with unique per-user votes, private media storage and processing, reporting/moderation tools, consent and deletion controls, and a server-side AI analysis pipeline whose output remains visibly separated from trainer-authored advice. Do not expose raw gym videos publicly by default or use the current demo vote counts as reward inputs.

### Server-attested prototype rewards

The reward core is intentionally separate from the wallet memo. A trusted analysis service may call `POST /api/rewards/attest` with `x-spotter-issuer-token` only after it has independently accepted the workout evidence. The route recomputes the claim digest and returns a ten-minute HMAC-signed attestation bound to one wallet. The wallet must sign the exact off-chain redemption message before `POST /api/rewards/redeem` awards points. Reused attestations, claims, evidence IDs, and gym-visit IDs are rejected.

Set independent random values of at least 32 bytes for `REWARD_ATTESTATION_SECRET` and `REWARD_ISSUER_TOKEN`. Both are server-only. The browser must never receive either value.

Policy v1 grants 10 participation points for an accepted set, two per repetition up to 40, and at most 12 additional points for time backed by a trusted rotating-QR check-in/out record. The total is capped at 60. The policy does **not** use the provisional form score, and clip duration never earns gym-time points.

The included ledger is an explicit single-process prototype: balances and used attestation IDs are kept in memory and disappear on restart. It demonstrates signature checking and replay rejection, but it is not safe for horizontally scaled or production deployment.

With `REWARD_*` secrets and the local demo keypair configured, `/rewards` can claim points through `POST /api/rewards/claim` (server issues + auto-redeems for the demo wallet) and shows ranking via `GET /api/rewards/leaderboard`. Community votes never feed this board. A durable database with a unique constraint on `attestationId`, authenticated analysis service, rate limiting, and auditable QR issuer are required before production use. No reward token is minted.

With a configured app server running, `npm run test:rewards-api` exercises issuance, wallet signing, successful redemption, and HTTP 409 replay rejection using a throwaway wallet. Set `REWARD_BASE_URL` only if the server is not at `http://127.0.0.1:3000`. The script needs the same test `REWARD_ISSUER_TOKEN` as the server but never receives the attestation secret.

## What is measured

- Decode 15 sample frames per second of source video, offline. Actual analysis speed depends on the device; this is not a real-time throughput claim.
- MediaPipe lite detects up to two people. Only frames with exactly one detected person are accepted. Choose one body side for the entire clip based on landmark visibility.
- Convert normalized landmarks into pixel coordinates before computing 2D knee angles and torso lean. Smooth knee angles before phase detection.
- Version 2 estimates an upright reference from the 90th percentile of visible knee angles. A cycle leaves the top band (reference minus 8°), crosses reference minus 14°, bends at least 20° relative to the reference, and returns to the top band. Require two excursion samples and at least 0.3 s overall to reject brief noise. Depth and phase speed do not determine whether a rep counts.
- Missing landmarks or tracking gaps above 0.25 s reset the cycle. Unfinished reps are excluded. These conservative thresholds can miss valid reps and require testing on actual footage.
- The prototype movement score averages `min(70, max(0, 160 − minimumKneeAngle)) + descentPoints + ascentPoints`. Descent earns 15 points at ≥0.8 s (otherwise 5); ascent earns 15 at ≥0.5 s (otherwise 5). A score requires a complete rep and ≥75% usable frames.

The legacy movementScore remains in JSON for compatibility but is removed from the primary interface. It is an uncalibrated range-and-tempo rubric. Torso lean is reported in the JSON, not universally penalized. Knee tracking in the frontal plane, joint loading, muscle activation, anatomical squat depth, body composition, and injury risk are not measured. Gemini is asked to ground its commentary in the supplied images and state uncertainty.

## Validation

```sh
npm test
python3 -m unittest tests/test_worker.py
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Alternatively use an installed Google Chrome with `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`.

Tests include a reduced trace from a real 14.4-second front-squat clip: five repetitions detected where the original detector counted only one. Run the actual video through the browser regression with `SQUAT_CLIP=/absolute/path/to/clip.mp4 PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`. The video itself is not committed. Tests also cover geometry, synthetic reps, partial reps, static/empty scenes, occlusion, gaps, aspect ratio, schema rejection, accessibility, and mobile layout. Validation on one real clip does not establish accuracy across people, exercises, or camera views.

## Next steps

1. Validate counts and phases against manually labeled side-view squat clips; verify Gemini with configured credentials.
2. Run the Kimodo worker on a supported NVIDIA host and verify the adapter against a real SOMA-RP v1.1 generation. The viewer and authenticated job path are implemented; live model execution remains unverified.
3. Verify the Wallet Standard flow with an installed devnet wallet and an Explorer-confirmed workout receipt. The client, claim hashing, Memo transaction, local validator execution, and conditional control are implemented.
4. Connect the server-attested reward core to an authenticated analysis service and durable store, then add rotating-QR attendance evidence. Keep it out of the UI until those trusted dependencies exist; clip duration is not total time at the gym.

Continuity and task handoffs: `.codex/PROJECT_LEDGER.md`.

## References

- [MediaPipe Pose Landmarker for Web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [NVIDIA Kimodo](https://research.nvidia.com/labs/sil/projects/kimodo/)
- [Kimodo CLI](https://research.nvidia.com/labs/sil/projects/kimodo/docs/user_guide/cli.html)
- [Kimodo constraints](https://research.nvidia.com/labs/sil/projects/kimodo/docs/user_guide/constraints.html)
- [Kimodo output formats](https://research.nvidia.com/labs/sil/projects/kimodo/docs/user_guide/output_formats.html)
- [Solana Next.js + Kit](https://solana.com/docs/frontend/nextjs-solana)
- [Solana transactions](https://solana.com/docs/intro/quick-start/writing-to-network)

## UI customization

See [the UI editing guide](docs/ui-system.md) for the shared theme, component variants, navigation configuration, and validation workflow.

### Participation rewards and Community leaderboard

Recorded sessions for all five exercises can collect **account-based participation points** in Analyze or Profile → Rewards. The server validates the bounded summary, derives points (10/set + 2/rep, capped at 20 reps), rejects repeat summaries for the same account, and enforces a 200-point UTC daily limit in a SQLite transaction. A plank hold earns the set's 10 points. Rankings share this ledger, with calendar week/month/all-time periods, exercise filters, search, shared ranks for ties, pagination, personal statistics, and recent claims. Athlete aliases avoid publishing Auth0 names/emails. These are self-reported participation points, not verified exercise evidence or redeemable currency.

Requires **Node 22.13+**. SQLite defaults to `.data/rewards.sqlite` (gitignored); configure `REWARDS_DB_PATH` to a persistent volume for a single-host deployment. Back up the database with SQLite-aware tooling. Serverless or multiple-host deployment needs a shared transactional database before deployment; ephemeral filesystems will not preserve these points. Auth0 owns account identity; development auth bypass shares one development account and is disabled by production builds.

The old public demo endpoints now return 410 and cannot spend a server keypair. The issuer-protected attestation/redemption APIs remain a separate experimental protocol and do not feed this participation leaderboard. Never turn browser-supplied summaries into trusted attestations or automatic crypto payouts.

The Wallet section connects a browser wallet and builds an actual System Program SOL transfer, requires wallet approval, checks the devnet genesis hash, and accepts up to 1 devnet SOL with exact integer lamport conversion. Points are not debited or converted by this transfer. No mainnet payouts or token redemption policy has been configured. A funded treasury, verified eligibility, approved payout amounts, and durable payout reconciliation are prerequisites for monetary rewards.

Run `npm run test:solana-transfer` for a signed transfer and recipient-balance assertion in LiteSVM. `RUN_SOLANA_DEVNET=1 npm run test:solana-transfer` runs the same check on public devnet using `SOLANA_KEYPAIR_PATH` if configured, otherwise a throwaway signer. It sends 0.001 test SOL to a throwaway recipient; never configure a mainnet RPC. The script refuses a non-devnet genesis hash. Public validation currently fails at faucet funding because the configured sender has zero devnet SOL.

## Gym competitions

The responsive competition sidebar shows organizer-published challenges, confirmed Solana devnet prize pools, reviewed standings and the 50/30/20 payout split. Winners claim after organizer finalization. See [competition setup and trust boundaries](docs/competitions.md) and [verified devnet funding/payout receipts](docs/competition-devnet-verification.md). Demo gyms and athletes are fictional; devnet pool and payout transactions are real test-network operations.
