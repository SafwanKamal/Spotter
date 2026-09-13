# Spotter

*Your gym clip, reviewed. Every rep, on the record.*

## One rep

Fourteen seconds of front squat, filmed on a phone propped against a wall. Five reps, countable by eye. The pose model found the body in 100% of frames.

My rep counter said **1**.

That turned out not to be a bug. The detector gated on fixed thresholds — descend past this knee angle, hold that phase for this long. Reasonable-looking numbers, except an absolute threshold quietly encodes an assumption about *whose body you're measuring*: particular limb proportions, a particular camera angle, particular mobility. Everyone else gets told they didn't do the thing they just did.

So I made every measurement relative to the lifter's own body. Take the 90th percentile of their knee-angle series as the standing baseline $\theta_{\text{up}}$, then run a Schmitt trigger against it: enter a rep below $\theta_{\text{up}} - 14^\circ$, stand again above $\theta_{\text{up}} - 8^\circ$. Depth and tempo stopped being gates and became things I report.

Same clip, same landmarks: **5 reps**, bottoms at 1.40 / 4.20 / 6.87 / 9.67 / 12.67 s, mean bottom error 0.002 s. Everything I built afterward inherited that lesson.

## Why I built it

The person who watches you lift is called a spotter, and most people training alone don't have one. **540 million people used fitness apps in 2025**, and nearly all of them log *intentions* — sets and reps you typed in yourself — rather than movement. A coach who actually watches costs **$40–$100 an hour**, so observation gets rationed by price. Meanwhile **~608,584 resistance-training injuries** reached US emergency departments between 2013 and 2022, average patient age **22.8**: exactly the person training alone with a phone propped against a water bottle.

## What it does

Point a camera or drop in a clip. Spotter recognizes the exercise — squat, push-up, lunge, deadlift or plank — counts complete reps, measures camera-view angles and tempo, pulls keyframes for every rep, and tells you what fraction of frames it could actually see you in. It explains with timestamped cues *and its own stated limitations*, speaks cues aloud on-device while you train, replays a 3D demonstration at your set's real tempo, and can write a Solana receipt proving a session happened without publishing a single frame of it.

Video never leaves the device on the local path. At most six keyframes go out, opt-in.

## The rule

> **Each layer may only claim what the layer beneath it can prove.**

Measurement is deterministic 2D geometry — for a joint $b$ between neighbours $a$ and $c$,

$$\theta = \arccos\!\left(\frac{(a-b)\cdot(c-b)}{\lVert a-b \rVert\,\lVert c-b \rVert}\right)$$

with any landmark below $0.7$ visibility discarded. I call that a *camera-view* angle, not a joint angle, and that one word is the discipline of the whole project: a single phone camera measures a projection, not a body. Above it, the model interprets and states its uncertainty but never issues a safety verdict. The 3D replay is a labeled demonstration rather than a reconstruction of you, walled off from every metric and every reward.

## The night I almost bought a GPU

Live 3D generation was running near four minutes. A persistent text-encoder service got it to ~120 s, which felt like progress and pointed at an obvious conclusion: more hardware.

Then I timed the diffusion step alone. **Three seconds.** A local `./kimodo` checkout sitting on `sys.path` was shadowing the installed package, forcing every job down the CLI path and reloading the motion checkpoint from network storage — *even with the model already warm in memory*. I stripped the checkout paths, started the worker from `/tmp`, and preloaded the model.

**~120 s → ~3.1 s uncached, 0.04 s cached**, twelve sequential jobs without a queue failure. I didn't need a bigger GPU. I needed to read a stack trace.

## Deleting the best-looking thing I made

I had a score ring: a big percentage labeled "form quality," easily the most attractive element in the app. It was also the most misleading — a percent score reads as an objective medical assessment, and a 2D projection through one lens hasn't earned that. I deleted it. The only percentage left is "body tracked in X% of frames," which describes the camera rather than the athlete.

## What I learned

Benchmark instead of defaulting: **Lite at 23.05 ms and 100% coverage** beat **Heavy at 85.67 ms and 83.7%** on speed *and* accuracy. Profile before you scale, or you'll buy hardware to fix an import path. Absolute thresholds smuggle in assumptions about who your user is.

And privacy turned out not to be only an ethic. Inference runs on the phone, so marginal cost per analysis is approximately zero — the same decision that keeps your video on your device is the one that makes the economics work.

## What's next

Pose inference off the main thread, validated against labeled clips across more bodies and camera angles. An authenticated analysis service, a durable store and auditable rotating-QR gym check-in — the three dependencies that turn self-reported points into verified ones. Then one sponsor-funded challenge with single-use claims.

Honest limits I carry forward: the movement score is an uncalibrated range-and-tempo rubric, single-camera 3D reconstruction is out of scope, and production anti-cheat isn't built. Each one is named inside the product itself, which is the point.

Fitness software has spent a decade getting very good at counting what you told it you did. Spotter is built on the opposite premise: **measure what actually happened, say only what you can prove, and make that proof portable.**
