"use client";
import { Button } from "@/components/ui/button";
import { Arrow } from "@/components/ui/arrow";
import { useCoachVoice } from "@/components/use-coach-voice";
import RewardClaim from "./reward-claim";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseFrame } from "@/lib/analysis";
import { analyzeExercise } from "@/lib/exercises/engine";
import type { ExerciseAnalysis, ExerciseId } from "@/lib/exercises/types";
import { LiveCoachTracker, type LiveCue } from "@/lib/exercises/live-cues";

// A generalized, additive pose-detection setup — duplicated (not imported)
// from src/lib/video.ts for the same reason engine.ts and
// src/lib/exercises/video.ts do: this new live-camera path must never be
// able to change behavior for the existing squat upload pipeline. The
// MediaPipe package version, wasm URL, model asset URL, and detector
// settings are copied exactly from src/lib/video.ts — nothing about the
// model or provider changes here, only that frames come from a live camera
// stream instead of a decoded file.
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
    (arg) =>
      typeof arg === "string" &&
      MEDIAPIPE_NOISE_PATTERNS.some((pattern) => pattern.test(arg)),
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

// A live session runs until stopped or until this cap, whichever comes
// first — long enough for a real working set, short enough that the
// growing frame buffer and its periodic re-analysis stay cheap.
const MAX_SESSION_SECONDS = 120;
const DETECTION_INTERVAL_MS = 80; // ~12.5 fps, close to the 15 fps the detectors are tuned around
const ANALYSIS_INTERVAL_MS = 700;

function Skeleton({
  frame,
  mirrored,
}: {
  frame?: PoseFrame;
  mirrored?: boolean;
}) {
  if (!frame) return null;
  const links = [
    [11, 12],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
  ];
  const ids = [...new Set(links.flat())];
  const visible = (i: number) => (frame.landmarks[i]?.visibility ?? 0) > 0.7;
  return (
    <svg
      className="skeleton"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-label="Detected body landmarks"
      // Applied directly on the already-absolutely-positioned .skeleton
      // element, not a wrapping div: a transform on any element (even
      // position:static) establishes a new containing block for absolutely
      // positioned descendants, so a wrapper here would break this SVG's
      // own "inset: 0" sizing against .video-fit and collapse it to zero
      // height instead of overlaying the mirrored video.
      style={mirrored ? { transform: "scaleX(-1)" } : undefined}
    >
      {links
        .filter(([a, b]) => visible(a) && visible(b))
        .map(([a, b]) => (
          <line
            key={a + "-" + b}
            x1={frame.landmarks[a].x * 1000}
            y1={frame.landmarks[a].y * 1000}
            x2={frame.landmarks[b].x * 1000}
            y2={frame.landmarks[b].y * 1000}
            stroke="var(--pose-landmark)"
            strokeWidth="4"
          />
        ))}
      {ids.filter(visible).map((i) => (
        <circle
          key={i}
          cx={frame.landmarks[i].x * 1000}
          cy={frame.landmarks[i].y * 1000}
          r="6"
          fill="var(--pose-landmark)"
          stroke="var(--ink)"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

type SessionState = "idle" | "starting" | "running" | "stopped";

export default function LiveCameraCoach({ exercise }: { exercise: ExerciseId }) {
  const [state, setState] = useState<SessionState>("idle");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<ExerciseAnalysis | null>(null);
  const [cueLog, setCueLog] = useState<LiveCue[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const {
    configured: voiceConfigured,
    voiceOn,
    speaking,
    speak,
    preview,
    stopSpeech,
    setVoiceOn,
  } = useCoachVoice();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<
    import("@mediapipe/tasks-vision").PoseLandmarker | null
  >(null);
  const restoreConsoleRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);
  const analysisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);
  const framesRef = useRef<PoseFrame[]>([]);
  const startTimeRef = useRef(0);
  const lastDetectionRef = useRef(0);
  const trackerRef = useRef(new LiveCoachTracker(exercise));
  const [displayFrame, setDisplayFrame] = useState<PoseFrame | undefined>(
    undefined,
  );

  const releaseResources = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (analysisTimerRef.current !== null)
      clearInterval(analysisTimerRef.current);
    analysisTimerRef.current = null;
    if (cameraWatchdogRef.current !== null)
      clearInterval(cameraWatchdogRef.current);
    cameraWatchdogRef.current = null;
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.onerror = null;
      video.pause();
      video.srcObject = null;
    }
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    restoreConsoleRef.current?.();
    restoreConsoleRef.current = null;
    stopSpeech();
  }, [stopSpeech]);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    releaseResources();
    setDisplayFrame(undefined);
    if (mountedRef.current) setState("stopped");
  }, [releaseResources]);

  useEffect(() => {
    if (state !== "stopped" || !analysis) return;
    try {
      sessionStorage.setItem(
        "spotter.rewardSession.v1",
        JSON.stringify({
          source: analysis.source,
          exercise: analysis.exercise,
          duration: analysis.duration,
          coverage: analysis.coverage,
          reps: (analysis.reps ?? []).map(({ start, end }) => ({
            start,
            end,
          })),
        }),
      );
    } catch {
      // Points can still be collected on this page if storage is unavailable.
    }
  }, [state, analysis]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      releaseResources();
    };
  }, [releaseResources]);

  async function start() {
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    releaseResources();
    setError("");
    setAnalysis(null);
    setCueLog([]);
    setElapsed(0);
    setDisplayFrame(undefined);
    framesRef.current = [];
    trackerRef.current.reset(exercise);
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (sessionRef.current !== session || !mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is not ready.");

      const interrupt = (message: string) => {
        if (sessionRef.current !== session) return;
        sessionRef.current += 1;
        releaseResources();
        setDisplayFrame(undefined);
        if (mountedRef.current) {
          setState("stopped");
          setError(message);
        }
      };
      for (const track of stream.getVideoTracks()) {
        track.onended = () =>
          interrupt("The camera feed ended. Check the camera connection and start again.");
      }
      video.onerror = () =>
        interrupt("The camera preview stopped unexpectedly. Start the camera again.");
      video.srcObject = stream;
      await video.play();
      if (sessionRef.current !== session) return;

      restoreConsoleRef.current = silenceMediapipeNoise();
      const { FilesetResolver, PoseLandmarker } = await import(
        "@mediapipe/tasks-vision"
      );
      if (sessionRef.current !== session) return;
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
      );
      if (sessionRef.current !== session) return;
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
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
      if (sessionRef.current !== session || !mountedRef.current) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;
      startTimeRef.current = performance.now();
      lastDetectionRef.current = 0;
      try {
        sessionStorage.removeItem("spotter.rewardSession.v1");
      } catch {
        // A previous live session can still be claimed from Rewards.
      }
      setState("running");

      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        const video = videoRef.current;
        const landmarker = landmarkerRef.current;
        if (!video || !landmarker || video.readyState < 2) return;
        const elapsedMs = performance.now() - startTimeRef.current;
        if (elapsedMs - lastDetectionRef.current < DETECTION_INTERVAL_MS)
          return;
        lastDetectionRef.current = elapsedMs;
        const time = elapsedMs / 1000;
        if (time > MAX_SESSION_SECONDS) {
          stop();
          return;
        }
        let result;
        try {
          result = landmarker.detectForVideo(video, Math.round(elapsedMs));
        } catch {
          interrupt("Live pose tracking stopped unexpectedly. Start the camera again.");
          return;
        }
        const frame: PoseFrame = {
          time,
          landmarks:
            result.landmarks.length === 1
              ? result.landmarks[0].map((p) => ({
                  x: p.x,
                  y: p.y,
                  z: p.z,
                  visibility: p.visibility,
                }))
              : [],
        };
        framesRef.current.push(frame);
        setElapsed(time);
        setDisplayFrame(frame);
      };
      rafRef.current = requestAnimationFrame(loop);

      let lastVideoTime = video.currentTime;
      let stalledChecks = 0;
      cameraWatchdogRef.current = setInterval(() => {
        if (sessionRef.current !== session) return;
        const currentVideo = videoRef.current;
        const track = streamRef.current?.getVideoTracks()[0];
        if (!currentVideo || !track || track.readyState === "ended") {
          interrupt("The camera feed ended. Check the camera connection and start again.");
          return;
        }
        if (
          currentVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          currentVideo.currentTime <= lastVideoTime + 0.01
        ) {
          stalledChecks += 1;
        } else {
          stalledChecks = 0;
          lastVideoTime = currentVideo.currentTime;
        }
        if (stalledChecks >= 3) {
          interrupt("The camera feed stopped updating. Check the camera connection and start again.");
        }
      }, 1500);

      analysisTimerRef.current = setInterval(() => {
        const frames = framesRef.current;
        if (frames.length < 8) return;
        const duration = frames[frames.length - 1].time + 1 / 15;
        const nextAnalysis = analyzeExercise(
          exercise,
          frames,
          1000,
          1000,
          duration,
          "live",
        );
        setAnalysis(nextAnalysis);
        const newCues = trackerRef.current.update(nextAnalysis);
        if (newCues.length) {
          setCueLog((previous) => [...previous, ...newCues].slice(-8));
          for (const cue of newCues) speak(cue.text);
        }
      }, ANALYSIS_INTERVAL_MS);
    } catch (e) {
      if (sessionRef.current !== session) return;
      sessionRef.current += 1;
      releaseResources();
      setState("idle");
      setDisplayFrame(undefined);
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Camera access was not granted. Allow camera access and try again."
          : e instanceof Error
            ? e.message
            : "Could not start the camera.",
      );
    }
  }

  const cyclic = analysis?.mode === "cyclic";
  const hold = analysis?.mode === "hold" ? analysis.hold : undefined;

  return (
    <div className="journal page-journal" id="live-coach">
      <header className="page-head">
        <div>
          <h1>Live camera</h1>
          <p>
            Real-time cues while you move — spoken aloud when a coaching voice
            is configured, and always shown as text.
          </p>
        </div>
      </header>
      <div className="review-layout">
        <section className="recording" aria-labelledby="live-recording-title">
          <div className="section-bar">
            <h2 id="live-recording-title">Live camera</h2>
            {state === "running" && (
              <span className="subtle-tag">{elapsed.toFixed(0)}s elapsed</span>
            )}
          </div>
          <div
            className={
              "video-stage " +
              (state === "idle" || state === "stopped" ? "empty" : "")
            }
          >
            {state === "idle" || state === "stopped" ? (
              <div className="upload-content">
                <h3>
                  {state === "stopped" ? "Camera stopped." : "Ready when"}
                  <br />
                  {state === "stopped" ? "Your results are saved." : "you are."}
                </h3>
                <p>
                  {state === "stopped"
                    ? "Start again when you are ready for another set."
                    : "Start your camera, step back so your full body is in view, and begin your set."}
                </p>
                <Button variant="primary" onClick={start}>
                  {state === "stopped" ? "Start again" : "Start camera"}
                  <Arrow />
                </Button>
                <small>
                  Video is processed on your device and never uploaded.
                </small>
              </div>
            ) : (
              <div
                className="video-fit"
                style={{
                  aspectRatio: 16 / 9,
                  maxWidth: "calc(var(--stage-height) * 1.78)",
                }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{ transform: "scaleX(-1)" }}
                />
                <Skeleton frame={displayFrame} mirrored />
              </div>
            )}
          </div>
          {state === "starting" && (
            <div className="progress" role="status">
              <div className="progress-copy">
                <span>Starting the camera…</span>
              </div>
            </div>
          )}
          {state === "running" && (
            <div className="video-actions">
              <Button
                variant="unstyled"
                className="toggle"
                aria-pressed={voiceOn}
                onClick={() => setVoiceOn(!voiceOn)}
              >
                <span aria-hidden="true">{voiceOn ? "●" : "○"}</span> Spoken
                cues
              </Button>
              <div>
                <Button variant="primary" onClick={stop}>
                  Stop session
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <p className="recording-caption">
            {voiceConfigured
              ? "Coaching cues are generated locally from your measurements and spoken aloud."
              : voiceConfigured === false
                ? "A live coaching voice is not connected yet — cues still appear as text below. Set ELEVENLABS_API_KEY in .env.local to enable speech."
                : "Checking whether a coaching voice is connected…"}
          </p>
          {voiceConfigured && state !== "running" ? (
            <div className="video-actions">
              <Button
                variant="outline"
                onClick={() => preview()}
                disabled={speaking}
              >
                {speaking ? "Speaking…" : "Hear a sample"}
              </Button>
            </div>
          ) : null}
        </section>
        <aside className="session-review" aria-labelledby="live-set-title">
          <h2 id="live-set-title">
            {analysis ? "Tracking your set." : "Small details. Useful insight."}
          </h2>
          <div className="rep-summary">
            {cyclic ? (
              <div className="rep-summary-count">
                <strong>{analysis?.reps?.length ?? 0}</strong>
                <div>
                  <span>repetitions so far</span>
                  <small>{elapsed.toFixed(0)}s of live tracking</small>
                </div>
              </div>
            ) : (
              <div className="rep-summary-count">
                <strong>
                  {hold ? hold.totalGoodFormSeconds.toFixed(0) : 0}
                </strong>
                <div>
                  <span>seconds in good form</span>
                  <small>{elapsed.toFixed(0)}s of live tracking</small>
                </div>
              </div>
            )}
            <div className="tracking">
              <span aria-hidden="true">◉</span>
              <p>
                {analysis
                  ? "Body tracked in " +
                    Math.round(analysis.coverage * 100) +
                    "% of frames so far"
                  : "Keep your full body in view"}
                <small>
                  Tracking coverage describes visibility, not form quality.
                </small>
              </p>
            </div>
          </div>
          <div className="coaching">
            <h3>Coaching log</h3>
            {cueLog.length ? (
              cueLog
                .slice()
                .reverse()
                .map((c, i) => <p key={c.key + i}>{c.text}</p>)
            ) : (
              <p>
                {state === "running"
                  ? "Cues will appear here as your set continues."
                  : "Start a session to see live cues here."}
              </p>
            )}
          </div>
          {state === "stopped" && analysis && (
            <RewardClaim
              analysis={{
                source: analysis.source,
                exercise: analysis.exercise,
                duration: analysis.duration,
                coverage: analysis.coverage,
                reps: analysis.reps ?? [],
              }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
