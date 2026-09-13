import { analyzeSquats, type PoseFrame } from "./analysis";

// @mediapipe/tasks-vision routes its native (C++/WASM) logging — including
// harmless INFO-level messages like delegate creation — through
// console.error. That trips Next's dev-mode "Console Error" overlay even
// though nothing has failed. Silence only those known, specific messages
// while the model is loading/running; anything else still reaches the
// console normally.
const MEDIAPIPE_NOISE_PATTERNS = [
  /XNNPACK delegate/i,
  /TensorFlow Lite/i,
  /gl_context/i,
  /inference_feedback_manager/i,
  /landmark_projection_calculator/i,
  /OpenGL error checking/i,
];

function isMediapipeNoise(args: unknown[]): boolean {
  return args.some(
    (arg) => typeof arg === "string" && MEDIAPIPE_NOISE_PATTERNS.some((pattern) => pattern.test(arg)),
  );
}

function silenceMediapipeNoise(): () => void {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (isMediapipeNoise(args)) return;
    originalConsoleError(...args);
  };
  return () => {
    console.error = originalConsoleError;
  };
}

export type Keyframe = { time: number; label: string; image: string };
export type ClipResult = Awaited<ReturnType<typeof analyzeVideo>>;

function waitFor(video: HTMLVideoElement, event: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener("error", error);
      signal.removeEventListener("abort", abort);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const error = () => {
      cleanup();
      reject(
        new Error(
          "This video could not be decoded. Try an MP4 (H.264) or WebM file.",
        ),
      );
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Video decoding timed out. Try a shorter MP4 clip."));
    }, 15000);
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", error, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
async function seek(
  video: HTMLVideoElement,
  time: number,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2)
    return;
  const ready = waitFor(video, "seeked", signal);
  video.currentTime = time;
  await ready;
}

export async function analyzeVideo(
  file: File,
  signal: AbortSignal,
  progress: (percent: number, status: string) => void,
) {
  if (file.size > 100 * 1024 * 1024)
    throw new Error("Choose a video smaller than 100 MB.");
  const video = document.createElement("video"),
    url = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  let landmarker: import("@mediapipe/tasks-vision").PoseLandmarker | undefined;
  let restoreConsoleError: (() => void) | undefined;
  try {
    const ready = waitFor(video, "loadeddata", signal);
    video.src = url;
    await ready;
    // MediaRecorder WebM files can omit duration metadata. Seeking to the end lets the decoder discover it.
    if (video.duration === Infinity) {
      await seek(video, 1e7, signal);
      await seek(video, 0, signal);
    }
    if (
      !Number.isFinite(video.duration) ||
      video.duration < 3 ||
      video.duration > 30
    )
      throw new Error("Choose a clip between 3 and 30 seconds long.");
    progress(0, "Preparing analysis…");
    restoreConsoleError = silenceMediapipeNoise();
    const { FilesetResolver, PoseLandmarker } =
      await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
    );
    signal.throwIfAborted();
    landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    const frames: PoseFrame[] = [],
      total = Math.floor(video.duration * 15);
    for (let i = 0; i < total; i++) {
      await seek(video, i / 15, signal);
      const result = landmarker.detectForVideo(video, Math.round((i / 15) * 1000));
      frames.push({
        time: i / 15,
        landmarks:
          result.landmarks.length === 1
            ? result.landmarks[0].map((p) => ({
                x: p.x,
                y: p.y,
                z: p.z,
                visibility: p.visibility,
              }))
            : [],
      });
      progress(
        Math.round(((i + 1) / total) * 95),
        "Measuring movement…",
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const analysis = analyzeSquats(
      frames,
      video.videoWidth,
      video.videoHeight,
      video.duration,
    );
    const chosen = analysis.reps.length
      ? analysis.reps.flatMap((r, i) => [
          { time: r.start, label: `Rep ${i + 1} · start` },
          { time: r.bottom, label: `Rep ${i + 1} · bottom` },
          { time: r.end, label: `Rep ${i + 1} · return` },
        ])
      : [0.1, 0.5, 0.9].map((fraction, i) => ({
          time: video.duration * fraction,
          label: `Context ${i + 1}`,
        }));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(
      video.videoWidth *
        Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight)),
    );
    canvas.height = Math.round(
      (video.videoHeight * canvas.width) / video.videoWidth,
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not create video keyframes.");
    const keyframes: Keyframe[] = [];
    for (const frame of chosen) {
      await seek(video, frame.time, signal);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      keyframes.push({ ...frame, image: canvas.toDataURL("image/jpeg", 0.72) });
    }
    progress(100, "Analysis complete");
    return { analysis, frames, keyframes };
  } finally {
    restoreConsoleError?.();
    landmarker?.close();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
