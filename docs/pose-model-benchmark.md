# Google pose-model benchmark

## Decision

Keep MediaPipe Pose Landmarker **Lite** as Spotter's default browser model.
On the supplied front-squat clip, Lite was the fastest tested model, retained
100% usable-landmark coverage, detected all five repetitions, and produced the
closest bottom timestamps to the manually reviewed reference.

This is an MVP device-and-clip decision, not a general claim that Lite is more
accurate on every exercise or camera setup. Re-run the benchmark on a broader
labeled clip set before making a production accuracy claim.

## Method

- Host: Apple Silicon Mac, CPU delegate
- Browser: installed Google Chrome in headless mode
- Input: supplied 14.37-second, five-repetition front-squat MP4
- Sampling: 15 frames per second
- MediaPipe Tasks Vision: 1.0.1
- Models: Pose Landmarker Lite, Full, and Heavy float16 release 1
- Shared thresholds: detection, presence, and tracking confidence 0.6
- Reference rep bottoms: 1.40, 4.20, 6.87, 9.67, and 12.67 seconds
- Jitter proxy: RMS high-frequency residual in the smoothed camera-view knee
  angle while the knee angle is above 155 degrees

The run measures model initialization, synchronous inference time, end-to-end
sampling time, usable measurement coverage, rep count, bottom timing, and the
jitter proxy. End-to-end time includes video seeking and is therefore not a
pure model-speed measurement.

## Results

| Model |   Init | Mean inference | P95 inference | End-to-end | Coverage | Reps | Mean bottom error | Upright residual |
| ----- | -----: | -------------: | ------------: | ---------: | -------: | ---: | ----------------: | ---------------: |
| Lite  | 1.41 s |       23.05 ms |      24.00 ms |    12.28 s |   100.0% |    5 |           0.002 s |    2.229 degrees |
| Full  | 1.60 s |       29.56 ms |      31.10 ms |    13.68 s |   100.0% |    5 |           0.027 s |    2.280 degrees |
| Heavy | 4.06 s |       85.67 ms |      87.60 ms |    25.75 s |    83.7% |    5 |           0.015 s |    2.407 degrees |

Detected bottom timestamps:

- Lite: 1.40, 4.20, 6.87, 9.67, 12.67 seconds
- Full: 1.40, 4.20, 6.93, 9.67, 12.60 seconds
- Heavy: 1.40, 4.20, 6.87, 9.67, 12.60 seconds

## Reproduce

```bash
SQUAT_CLIP=/absolute/path/to/clip.mp4 \
PLAYWRIGHT_CHANNEL=chrome \
npm run benchmark:pose
```

The benchmark does not upload the video or change the application UI. It runs
the three Google MediaPipe models locally in Chrome and prints JSON results.

## Follow-up acceptance

Before changing the default, test at least five labeled clips spanning body
size, clothing, lighting, camera distance, and left/right side views. Prefer a
larger model only when it produces a meaningful coverage, timing, or stability
improvement while remaining responsive on the target demo device.
