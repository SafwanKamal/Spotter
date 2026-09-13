import { chromium } from "@playwright/test";
import { analyzeSquats, type PoseFrame } from "../src/lib/analysis";
import {
  classifyExercise,
  extractExerciseFeatures,
} from "../src/lib/exercises/classifier";

const videoPath = process.env.SQUAT_CLIP;
if (!videoPath) throw new Error("Set SQUAT_CLIP to a local exercise video.");

const allModels = ["lite", "full", "heavy"] as const;
const requestedModels = new Set(
  (process.env.POSE_MODELS ?? "lite,full,heavy").split(","),
);
const models = allModels.filter((model) => requestedModels.has(model));
const expectedBottoms = [1.4, 4.2, 6.87, 9.67, 12.67];

function percentile(values: number[], fraction: number) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[
    Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))
  ];
}

function uprightResidual(
  frames: ReturnType<typeof analyzeSquats>["measurements"],
) {
  const residuals: number[] = [];
  for (let index = 1; index < frames.length - 1; index += 1) {
    const previous = frames[index - 1].knee;
    const current = frames[index].knee;
    const next = frames[index + 1].knee;
    if (previous === null || current === null || next === null) continue;
    if ((previous + current + next) / 3 < 155) continue;
    residuals.push(current - (previous + next) / 2);
  }
  return residuals.length
    ? Math.sqrt(
        residuals.reduce((sum, value) => sum + value * value, 0) /
          residuals.length,
      )
    : null;
}

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent('<input id="clip" type="file" accept="video/*">');
    await page.locator("#clip").setInputFiles(videoPath!);
    // tsx/esbuild annotates nested functions with this helper; Playwright
    // serializes the callback without the Node-side helper declaration.
    await page.evaluate(
      "globalThis.__name = function(target) { return target; }",
    );

    const results = [];
    for (const model of models) {
      const run = await page.evaluate(
        async ({ model }) => {
          const input = document.querySelector<HTMLInputElement>("#clip");
          const file = input?.files?.[0];
          if (!file)
            throw new Error("The browser did not receive the video file.");

          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.preload = "auto";
          const url = URL.createObjectURL(file);
          video.src = url;
          await new Promise<void>((resolve, reject) => {
            video.addEventListener("loadeddata", () => resolve(), {
              once: true,
            });
            video.addEventListener(
              "error",
              () => reject(new Error("Video decode failed.")),
              {
                once: true,
              },
            );
          });

          const moduleUrl =
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";
          const { FilesetResolver, PoseLandmarker } = await import(moduleUrl);
          const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
          );
          const modelUrl = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${model}/float16/1/pose_landmarker_${model}.task`;
          const initializationStarted = performance.now();
          const landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
            runningMode: "VIDEO",
            numPoses: 2,
            minPoseDetectionConfidence: 0.6,
            minPosePresenceConfidence: 0.6,
            minTrackingConfidence: 0.6,
          });
          const initializationMs = performance.now() - initializationStarted;

          const seek = (time: number) =>
            new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error("Video seek timed out.")),
                15_000,
              );
              video.addEventListener(
                "seeked",
                () => {
                  clearTimeout(timeout);
                  resolve();
                },
                { once: true },
              );
              video.currentTime = time;
            });

          const frames: PoseFrame[] = [];
          const inferenceTimes: number[] = [];
          const total = Math.floor(video.duration * 15);
          const runStarted = performance.now();
          for (let index = 0; index < total; index += 1) {
            await seek(index / 15);
            const inferenceStarted = performance.now();
            const detection = landmarker.detectForVideo(
              video,
              (index / 15) * 1000,
            );
            inferenceTimes.push(performance.now() - inferenceStarted);
            frames.push({
              time: index / 15,
              landmarks:
                detection.landmarks.length === 1
                  ? detection.landmarks[0].map(
                      (point: {
                        x: number;
                        y: number;
                        z: number;
                        visibility?: number;
                      }) => ({
                        x: point.x,
                        y: point.y,
                        z: point.z,
                        visibility: point.visibility,
                      }),
                    )
                  : [],
            });
          }
          const wallMs = performance.now() - runStarted;
          landmarker.close();
          URL.revokeObjectURL(url);

          return {
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            frames,
            inferenceTimes,
            initializationMs,
            wallMs,
          };
        },
        { model },
      );

      const analysis = analyzeSquats(
        run.frames,
        run.width,
        run.height,
        run.duration,
      );
      const classification = classifyExercise(
        run.frames,
        run.width,
        run.height,
        run.duration,
      );
      const timingErrors = analysis.reps.map((rep, index) =>
        index < expectedBottoms.length
          ? Math.abs(rep.bottom - expectedBottoms[index])
          : null,
      );
      const comparableErrors = timingErrors.filter(
        (value): value is number => value !== null,
      );
      results.push({
        model,
        initializationMs: Number(run.initializationMs.toFixed(1)),
        wallMs: Number(run.wallMs.toFixed(1)),
        inferenceMeanMs: Number(
          (
            run.inferenceTimes.reduce((sum, value) => sum + value, 0) /
            run.inferenceTimes.length
          ).toFixed(2),
        ),
        inferenceP50Ms: Number(percentile(run.inferenceTimes, 0.5).toFixed(2)),
        inferenceP95Ms: Number(percentile(run.inferenceTimes, 0.95).toFixed(2)),
        coverage: Number(analysis.coverage.toFixed(4)),
        reps: analysis.reps.length,
        classification,
        exerciseFeatures: extractExerciseFeatures(
          run.frames,
          run.width,
          run.height,
        ),
        bottoms: analysis.reps.map((rep) => Number(rep.bottom.toFixed(2))),
        meanBottomErrorSeconds:
          analysis.reps.length === expectedBottoms.length
            ? Number(
                (
                  comparableErrors.reduce((sum, value) => sum + value, 0) /
                  comparableErrors.length
                ).toFixed(3),
              )
            : null,
        uprightKneeResidualDegrees: (() => {
          const residual = uprightResidual(analysis.measurements);
          return residual === null ? null : Number(residual.toFixed(3));
        })(),
      });
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
