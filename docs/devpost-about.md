# Spotter

*Your gym clip, reviewed. Every rep, on the record.*

## Inspiration

The person who watches you lift is called a spotter. Most people training alone don't have one.

That gap is bigger than it sounds. **540 million people used fitness apps in 2025**, driving $3.4B in revenue — and almost every one of those apps logs *intentions*: sets, reps and weights you typed in yourself. Almost none of them observe *movement*. The feedback that actually changes how you lift comes from a coach who watches, and that costs **$40–$100 an hour** at a gym. It is the single most expensive thing in fitness, so it gets rationed by price.

Meanwhile, **~608,584 resistance-training injuries** reached US emergency departments between 2013 and 2022. The average patient was **22.8 years old**, and **38.5% of those injuries were to the trunk**. That is exactly the person training alone with a phone propped against a water bottle.

So the gap isn't motivation and it isn't tracking — both are solved markets. The gap is **observation**. Between "I did five squats" and "here is what your fifth squat looked like, and here is the frame where it changed," there was no product a normal person could use for free, in a gym, in ten seconds, without uploading video of their body to a stranger's server.

## What it does

Open the app. Point a camera, or drop in a clip. Spotter:

1. **Recognizes the exercise** — squat, push-up, lunge, deadlift or plank — classified from the landmark sequence itself, with the user always able to correct it.
2. **Counts and measures** — complete repetitions, camera-view knee angle over time, lowering and rising durations, phase keyframes for every rep, and an explicit "body tracked in X% of frames" coverage figure.
3. **Explains** — an AI review grounded in six sampled keyframes plus the measured numbers, returning timestamped cues *and its own stated limitations*.
4. **Talks while you train** — live camera mode narrates rule-based cues aloud as you move ("Rep 3. Good depth that rep."), generated on-device so the cue lands within a second of the moment it describes.
5. **Replays** — a 3D motion viewer plays a canonical demonstration of the movement at your set's actual tempo.
6. **Remembers, and rewards** — finished live sessions earn capped participation points on a real account ledger with leaderboards, and, optionally, a Solana receipt proving a session happened without publishing a single frame of it.

Video never leaves the device on the local analysis path. Only bounded, opt-in payloads go out: at most six JPEG keyframes for a review, a compact joint-motion summary for the 3D replay, and short cue text for speech.

## How I built it

One spine — **measure, interpret, narrate, replay, settle** — governed by a single rule I refused to break:

> **Each layer may only claim what the layer beneath it can prove.**

| Layer | What it does | What it is *not allowed* to claim |
| --- | --- | --- |
| **Measure** (MediaPipe, on-device) | Deterministic 2D joint geometry, rep cycles, coverage | Anatomical depth, joint load, injury risk |
| **Interpret** (Gemini 3.8 Flash) | Recognition, phase semantics, coaching language | A safety verdict or a calibrated form grade |
| **Narrate** (ElevenLabs Flash v2.5) | Short spoken cues from local measurements | Anything the local detector did not measure |
| **Replay** (NVIDIA Kimodo, Three.js) | Canonical tempo-matched demonstration | A reconstruction of *this* athlete's body |
| **Settle** (SQLite ledger, Solana devnet) | Capped participation points, hashed self-claims | Verified form quality or gym attendance time |

**Measurement** runs entirely in the browser. For a joint $b$ with neighbours $a$ and $c$ in normalized image coordinates, I take the planar angle

$$\theta = \arccos\!\left(\frac{(a-b)\cdot(c-b)}{\lVert a-b \rVert\,\lVert c-b \rVert}\right)$$

and drop any landmark whose visibility falls below $0.7$. Calling this *camera-view* angle rather than joint angle is the whole discipline of the project in one word: a single phone camera measures a projection, not anatomy.

**Model selection was a benchmark, not a default.** I ran all three pose variants at 15 FPS against a labeled clip:

| Variant | Mean inference | Coverage | Mean bottom error |
| --- | --- | --- | --- |
| **Lite** ✅ | **23.05 ms** | **100%** | **0.002 s** |
| Full | 29.56 ms | 100% | 0.027 s |
| Heavy | 85.67 ms | 83.7% | 0.015 s |

The heaviest model was the worst on every axis that mattered: 3.7× slower *and* it lost the body in 16% of frames.

The rest: **Next.js 16** with an optional Auth0 login (the app stays fully usable signed out), a Python worker on an **NVIDIA L4** generating BVH motion parsed under a strict 2 MB grammar-and-bounds check before it reaches the Three.js viewer, a **SQLite** participation ledger with weekly/monthly/all-time periods and a 200-point daily cap enforced inside a transaction, and a **Solana devnet** memo carrying a SHA-256 digest, exercise name, rep count and duration — no frames, no landmarks, no coaching text.

## Challenges I ran into

**1. My rep counter found one rep in a five-rep set.**

The original detector gated on fixed depth and phase-duration thresholds — absolute numbers, applied to every body. On a real 14.4-second front-squat clip with 100% landmark coverage, it counted **1 rep**.

The bug was conceptual. An absolute depth gate quietly encodes an assumption about whose body you are measuring. I rewrote counting to be relative to the athlete's own upright reference: take the 90th percentile of their angle series as the standing baseline $\theta_{\text{up}}$, then use a Schmitt trigger to enter a rep below $\theta_{\text{up}} - 14^\circ$ and return to standing above $\theta_{\text{up}} - 8^\circ$. Depth and tempo were demoted from gates to review metrics.

Same clip, same measurements, same landmarks: **5 reps**, with bottoms at 1.40 / 4.20 / 6.87 / 9.67 / 12.67 s and a mean bottom error of 0.002 s.

**2. A 3D replay that took two minutes — because of `sys.path`.**

Live motion generation was running near four minutes. I stood up a persistent text-encoder service, which got it to ~120 s, and was about to conclude I needed more GPU. Then I measured the diffusion step itself: **~3 seconds**. Everything else was overhead.

The real cause was package shadowing. A local `./kimodo` checkout sitting on `sys.path` was shadowing the installed package, forcing every job down the CLI path and reloading the motion checkpoint from network-backed storage — ~120 s — *even when the model was already warm in memory*. I stripped the checkout paths, started the worker from `/tmp`, preloaded the motion model, defaulted diffusion to 30 steps, and returned 503 during warmup so no request could fall back to the CLI.

Result: **~120 s → ~3.1 s uncached, 0.04 s cached**, with 12 sequential live jobs and no queue failures.

**3. Deleting the best-looking thing I built.**

I had a prominent percentage "form quality" score ring. It was the most attractive element in the product and the most misleading — a percent score is exactly the kind of number people read as an objective medical assessment. I deleted it, demoted the underlying measurement to a labeled range-and-tempo rubric, and kept only the percentage I could actually defend: "body tracked in X% of frames," which describes the camera, not the athlete.

**4. Latency has opinions about architecture.**

A coaching cue that arrives two seconds late is worse than no cue at all. That ruled out a cloud model for live coaching, no matter how good it is. Real-time cues are rule-based, generated on-device from the same measurements that drive rep counting; the cloud model is reserved for post-set review, where latency is free. Similarly, the 3D replay is walled off from every metric and every reward, because Kimodo needs metric 3D joint positions and one phone camera cannot measure them. It is labeled a generated demonstration, not a reconstruction.

**5. I was running two design languages at once.**

Mid-hackathon, the app had a "dashboard" idiom on some routes and an "editorial" idiom on others, with onboarding as a third. I stopped feature work and refactored:

| | Before | After |
| --- | --- | --- |
| Rendered font sizes | 31 | 10 |
| Spacing values | 40 | a 4px grid |
| Corner radii | 14 spellings | 5 |
| Card treatments | 5 | 2 |
| Page container widths | 5 | 1 |

## Accomplishments I'm proud of

- Five-exercise recognition and measurement running **entirely on-device**, with a benchmark-selected model and 100% landmark coverage on my test footage.
- A live Gemini request returning **schema-valid JSON** with conservative cues *and two explicitly self-stated limitations*.
- **~3.1 s uncached 3D generation** on live GPU hardware, down from multi-minute, diagnosed rather than brute-forced.
- A **finalized public devnet transaction** whose memo contains a hash and not a body, plus replay rejection returning HTTP 409.
- **43+ unit tests**, clean lint and typecheck, a clean production build, 9–11 Chrome end-to-end workflows, a WCAG A/AA scan with no violations, and no horizontal overflow at 390 px.
- Deleting my own flashiest feature because it claimed more than I could prove.

## What I learned

- **Benchmark instead of defaulting.** The biggest model was the worst model here, on speed *and* accuracy.
- **Profile before you scale.** I nearly bought GPU capacity to solve an import-path bug.
- **Absolute thresholds smuggle in assumptions.** Mine assumed a particular body. The fix was to measure every athlete against themselves.
- **Privacy isn't only an ethic, it's a cost structure.** Inference runs on the user's phone, so marginal cost per analysis is approximately zero. Most AI fitness products get more expensive the more their users love them. Mine doesn't.
- **The hardest engineering decision was subtraction.** In a category full of apps confidently grading bodies, being the one that tells the truth about what it can see is the position worth owning.

## What's next for Spotter

1. Move pose inference off the main thread and validate against labeled clips across more people, camera angles and body types.
2. Connect the reward core to an authenticated analysis service, a durable store, and auditable rotating-QR gym check-in — the three dependencies that turn self-reported points into verified ones.
3. Scope one sponsor-funded challenge with an on-chain budget, an authorized issuer and single-use claims.
4. Trainer verification, moderation and consent controls before any real footage is published socially.

Honest limits I carry forward: the movement score is an uncalibrated range-and-tempo rubric, single-camera 3D reconstruction is out of scope, and production anti-cheat is not built. Every one of those is named inside the product itself — which is the point.
