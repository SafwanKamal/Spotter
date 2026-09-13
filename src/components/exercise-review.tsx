"use client";
import { Button } from "@/components/ui/button";
import { Arrow } from "@/components/ui/arrow";
import { Input, Select } from "@/components/ui/field";
import { HelpHint } from "@/components/ui/help-hint";
import { useCoachVoice } from "@/components/use-coach-voice";

import { useEffect, useRef, useState } from "react";
import type { PoseFrame } from "@/lib/analysis";
import {
  analysisSpeechText,
  coachingSpeechText,
} from "@/lib/coach-voice";
import {
  selectCoachingKeyframes,
  toCoachingReps,
  type Coaching,
} from "@/lib/coaching";
import {
  briefToJointCoachInput,
  fallbackJointCoach,
  jointCoachSpeechText,
  type JointCoachReview,
} from "@/lib/joint-coach";
import { summarizeKinematics } from "@/lib/kinematics";
import { writeJointCoachReview } from "@/lib/replay-coach";
import { getExerciseDefinition } from "@/lib/exercises/engine";
import type { ExerciseAnalysis, ExerciseId } from "@/lib/exercises/types";
import {
  demoFramesForDeadlift,
  demoFramesForLunge,
  demoFramesForPlank,
  demoFramesForPushup,
} from "@/lib/exercises/demo-frames";
import { analyzeExercise } from "@/lib/exercises/engine";
import { classifyExercise } from "@/lib/exercises/classifier";
import {
  analyzeExerciseVideo,
  type ExerciseClipResult,
} from "@/lib/exercises/video";

const DEMO_FRAMES: Record<ExerciseId, (() => PoseFrame[]) | undefined> = {
  pushup: () => demoFramesForPushup(),
  lunge: () => demoFramesForLunge(),
  deadlift: () => demoFramesForDeadlift(),
  plank: () => demoFramesForPlank(),
  squat: undefined,
};

const clock = (t: number) =>
  Math.floor(t / 60) + ":" + (t % 60).toFixed(1).padStart(4, "0");

// Same generic skeleton overlay approach as the squat review: it only reads
// raw landmark positions, so it works unchanged for every exercise.
function Skeleton({ frame }: { frame?: PoseFrame }) {
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

export default function ExerciseReview({
  exercise,
}: {
  exercise: ExerciseId | "auto";
}) {
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState("");
  const [result, setResult] = useState<ExerciseClipResult | null>(null),
    [time, setTime] = useState(0),
    [ratio, setRatio] = useState(1);

  const [selected, setSelected] = useState(0),
    [overlay, setOverlay] = useState(true);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const {
    configured: voiceConfigured,
    speaking,
    speak,
    stopSpeech,
  } = useCoachVoice();
  const [coaching, setCoaching] = useState<Coaching | null>(null),
    [coachBusy, setCoachBusy] = useState(false),
    [coachError, setCoachError] = useState(""),
    [coachConfigured, setCoachConfigured] = useState<boolean | null>(null);
  const [jointCoach, setJointCoach] = useState<JointCoachReview | null>(null),
    [jointBusy, setJointBusy] = useState(false),
    [jointError, setJointError] = useState(""),
    [jointConfigured, setJointConfigured] = useState<boolean | null>(null);
  const abort = useRef<AbortController | null>(null),
    coachAbort = useRef<AbortController | null>(null),
    jointAbort = useRef<AbortController | null>(null),
    video = useRef<HTMLVideoElement>(null),
    input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/coach")
      .then((r) => r.json())
      .then((r) => setCoachConfigured(Boolean(r.configured)))
      .catch(() => setCoachConfigured(false));
    fetch("/api/joint-coach")
      .then((r) => r.json())
      .then((r) => setJointConfigured(Boolean(r.configured)))
      .catch(() => setJointConfigured(false));
  }, []);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(
    () => () => {
      abort.current?.abort();
      coachAbort.current?.abort();
      jointAbort.current?.abort();
    },
    [],
  );

  function reset() {
    stopSpeech();
    coachAbort.current?.abort();
    jointAbort.current?.abort();
    setCoaching(null);
    setCoachError("");
    setCoachBusy(false);
    setJointCoach(null);
    setJointError("");
    setJointBusy(false);
    setError("");
    setTime(0);
    setSelected(0);
  }
  function choose(f?: File) {
    if (!f || busy) return;
    reset();
    setResult(null);
    setFile(null);
    setUrl("");
    if (!f.type.startsWith("video/") || f.size > 100 * 1024 * 1024) {
      setError("Choose a video file under 100 MB.");
      return;
    }
    setFile(f);
    setUrl(URL.createObjectURL(f));
  }
  function demo() {
    reset();
    setFile(null);
    setUrl("");
    setRatio(1);
    const build =
      exercise === "auto" ? () => demoFramesForPushup() : DEMO_FRAMES[exercise];
    if (!build) return;
    const frames = build();
    const duration = frames.length
      ? frames[frames.length - 1].time + 1 / 15
      : 0;
    const classification =
      exercise === "auto"
        ? classifyExercise(frames, 1000, 1000, duration)
        : undefined;
    const resolvedExercise: ExerciseId =
      exercise === "auto" ? classification!.exercise : exercise;
    const analysis = analyzeExercise(
      resolvedExercise,
      frames,
      1000,
      1000,
      duration,
      "synthetic",
    );
    const nextResult: ExerciseClipResult = {
      analysis,
      classification,
      frames,
      keyframes: [],
      videoWidth: 1000,
      videoHeight: 1000,
    };
    setResult(nextResult);
    speak(analysisSpeechText(nextResult.analysis, nextResult.classification));
    void requestJointCoach(nextResult);
  }
  async function analyze() {
    if (!file) return;
    reset();
    setResult(null);
    setBusy(true);
    setProgress(0);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const nextResult = await analyzeExerciseVideo(
        file,
        exercise,
        controller.signal,
        (p, s) => {
          setProgress(p);
          setStatus(s);
        },
      );
      setResult(nextResult);
      speak(analysisSpeechText(nextResult.analysis, nextResult.classification));
      void requestJointCoach(nextResult);
      void requestCoaching(nextResult);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Analysis failed. Try again.",
        );
    } finally {
      setBusy(false);
    }
  }
  function jump(t: number) {
    setTime(t);
    if (video.current) {
      video.current.pause();
      video.current.currentTime = t;
    }
  }
  function selectRep(i: number) {
    setSelected(i);
    const rep = result?.analysis.reps?.[i];
    if (rep) jump(rep.bottom);
  }

  function correctExercise(nextExercise: ExerciseId) {
    if (!result) return;
    const analysis = analyzeExercise(
      nextExercise,
      result.frames,
      result.videoWidth,
      result.videoHeight,
      result.analysis.duration,
      result.analysis.source,
    );
    setSelected(0);
    setCoaching(null);
    setCoachError("");
    setJointCoach(null);
    setJointError("");
    const nextResult: ExerciseClipResult = {
      ...result,
      analysis,
      classification: result.classification
        ? {
            ...result.classification,
            exercise: nextExercise,
            confidence: 1,
            needsConfirmation: false,
            reason: "Exercise selected by you.",
          }
        : undefined,
    };
    setResult(nextResult);
    speak(analysisSpeechText(nextResult.analysis, nextResult.classification));
    void requestJointCoach(nextResult);
    void requestCoaching(nextResult);
  }

  async function requestCoaching(clip: ExerciseClipResult) {
    if (clip.analysis.source === "synthetic") return;
    if (!clip.keyframes.length) return;
    if (coachConfigured === false) return;
    coachAbort.current?.abort();
    setCoachBusy(true);
    setCoachError("");
    const controller = new AbortController();
    coachAbort.current = controller;
    const chosen = selectCoachingKeyframes(
      clip.keyframes,
      clip.analysis.reps ?? [],
    );
    const hold =
      clip.analysis.mode === "hold" && clip.analysis.hold
        ? {
            totalGoodFormSeconds: clip.analysis.hold.totalGoodFormSeconds,
            totalTrackedSeconds: clip.analysis.hold.totalTrackedSeconds,
            formBreaks: clip.analysis.hold.formBreaks,
            longestGoodFormSeconds: clip.analysis.hold.longestGoodFormSeconds,
          }
        : undefined;
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          duration: clip.analysis.duration,
          coverage: clip.analysis.coverage,
          reps: toCoachingReps(clip.analysis.reps ?? []),
          keyframes: chosen.map(({ time, label, image }) => ({
            time,
            label,
            image,
          })),
          claimedExercise: clip.analysis.exercise,
          localNotes: clip.analysis.cues.slice(0, 6),
          hold,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCoaching(data);
    } catch (e) {
      if (!controller.signal.aborted)
        setCoachError(e instanceof Error ? e.message : "Coaching failed.");
    } finally {
      if (coachAbort.current === controller) setCoachBusy(false);
    }
  }

  async function requestJointCoach(clip: ExerciseClipResult) {
    if (clip.frames.length < 8) return;
    const brief = summarizeKinematics({
      exercise: clip.analysis.exercise,
      frames: clip.frames,
      width: clip.videoWidth,
      height: clip.videoHeight,
      side: clip.analysis.side,
      duration: clip.analysis.duration,
      reps: clip.analysis.reps,
      hold: clip.analysis.hold,
    });
    const local = fallbackJointCoach(brief);
    setJointCoach(local);
    writeJointCoachReview(local);
    if (jointConfigured === false) {
      stopSpeech();
      speak(jointCoachSpeechText(local));
      setJointBusy(false);
      return;
    }
    jointAbort.current?.abort();
    setJointBusy(true);
    setJointError("");
    const controller = new AbortController();
    jointAbort.current = controller;
    try {
      const response = await fetch("/api/joint-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(briefToJointCoachInput(brief)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setJointCoach(data);
      writeJointCoachReview(data);
      stopSpeech();
      speak(jointCoachSpeechText(data));
    } catch (e) {
      if (!controller.signal.aborted) {
        stopSpeech();
        speak(jointCoachSpeechText(local));
        setJointError(
          e instanceof Error ? e.message : "Joint coaching failed.",
        );
      }
    } finally {
      if (jointAbort.current === controller) setJointBusy(false);
    }
  }

  const analysis = result?.analysis as ExerciseAnalysis | undefined,
    synthetic = analysis?.source === "synthetic",
    cyclic = analysis?.mode === "cyclic",
    rep = cyclic ? analysis?.reps?.[selected] : undefined,
    hold = analysis?.mode === "hold" ? analysis.hold : undefined;
  const resolvedExercise: ExerciseId =
    analysis?.exercise ?? (exercise === "auto" ? "squat" : exercise);
  const definition = getExerciseDefinition(resolvedExercise);
  const canAskCoach = Boolean(result && !synthetic && result.keyframes.length);
  const canAskJointCoach = Boolean(result && result.frames.length >= 8);
  const demoAvailable =
    exercise === "auto" || Boolean(DEMO_FRAMES[exercise]);
  const frame = result?.frames.reduce<PoseFrame | undefined>(
    (best, f) =>
      !best || Math.abs(f.time - time) < Math.abs(best.time - time) ? f : best,
    undefined,
  );
  const selectedFrames = rep
    ? result?.keyframes.slice(selected * 3, selected * 3 + 3)
    : result?.keyframes;
  const paths: string[] = [];
  let segment = "";
  analysis?.measurements.forEach((m) => {
    if (m.primary === null) {
      if (segment) paths.push(segment);
      segment = "";
    } else
      segment +=
        (segment ? " L" : "M") +
        (m.time / analysis.duration) * 1000 +
        "," +
        (190 - m.primary);
  });
  if (segment) paths.push(segment);
  const averageTime =
    cyclic && analysis?.reps?.length
      ? analysis.reps.reduce((s, r) => s + r.end - r.start, 0) /
        analysis.reps.length
      : 0;

  // Everything the review shows, as one file the person owns.
  function exportAnalysis() {
    if (!analysis) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      exercise: analysis.exercise,
      mode: analysis.mode,
      source: analysis.source,
      durationSeconds: analysis.duration,
      trackingCoverage: analysis.coverage,
      repCount: analysis.reps?.length ?? null,
      averageCycleSeconds: cyclic ? Number(averageTime.toFixed(2)) : null,
      hold: hold ?? null,
      reps: analysis.reps ?? null,
      measurements: analysis.measurements,
      baseline: analysis.baseline,
      notes: analysis.notes,
      cues: analysis.cues,
    };
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = href;
    link.download =
      analysis.exercise +
      "-analysis-" +
      new Date().toISOString().slice(0, 19).replaceAll(":", "-") +
      ".json";
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <div className="journal page-journal" id="exercise-review">
      <header className="page-head">
        <div>
          <h1>
            {exercise === "auto"
              ? "Movement review"
              : `${definition.label} review`}
          </h1>
          <p>
            {result
              ? "A closer look at the set you just recorded."
              : exercise === "auto"
                ? "Upload a set and the exercise is identified for you."
                : "Upload one short set. Everything is measured on this device."}
          </p>
        </div>
      </header>
      <div className={"review-layout" + (analysis ? "" : " solo")}>
        <section className="recording" aria-labelledby="recording-title">
          <div className="section-bar">
            <h2 id="recording-title">
              {synthetic
                ? "Sample recording"
                : file
                  ? "Your recording"
                  : "Start with a recording"}
            </h2>
            {result && (
              <span className="subtle-tag">
                {synthetic ? "Synthetic sample" : "Analyzed on your device"}
              </span>
            )}
          </div>
          <div className={"video-stage " + (!url && !synthetic ? "empty" : "")}>
            {url || synthetic ? (
              <div
                className="video-fit"
                style={{
                  aspectRatio: ratio,
                  maxWidth: "calc(var(--stage-height) * " + ratio + ")",
                }}
              >
                {url ? (
                  <video
                    ref={video}
                    src={url}
                    controls
                    onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) =>
                      setRatio(
                        e.currentTarget.videoWidth /
                          e.currentTarget.videoHeight,
                      )
                    }
                    onError={() =>
                      setError(
                        "This format cannot be played. Try an H.264 MP4 or WebM.",
                      )
                    }
                  />
                ) : (
                  <div className="sample-scene">
                    <span>SYNTHETIC LANDMARK SAMPLE</span>
                    <div className="sample-floor" />
                  </div>
                )}
                {overlay && <Skeleton frame={frame} />}
              </div>
            ) : (
              <div
                className="upload-content"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  choose(e.dataTransfer.files[0]);
                }}
              >
                <div className="framing-guide" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <svg viewBox="0 0 220 180">
                    <circle cx="114" cy="36" r="12" />
                    <path d="M112 52 L94 97 L129 122 L107 157 M94 97 L64 124 L45 153 M109 59 L140 77 L164 69" />
                    <path className="ground-line" d="M30 162 H186" />
                  </svg>
                </div>
                <h3>
                  {exercise === "auto"
                    ? "Upload a clip of one exercise"
                    : "Upload a clip of your set"}
                </h3>
                <p>
                  3–30 seconds, filmed from the side.
                  <br />Keep your whole body in frame — start in position,
                  finish clearly.
                </p>
                <Button
                  variant="primary"
                  onClick={() => input.current?.click()}
                >
                  Choose a video
                  <Arrow />
                </Button>
                {demoAvailable && (
                  <Button variant="sample" onClick={demo}>
                    {exercise === "auto"
                      ? "Explore recognition sample"
                      : "Explore a sample"}
                  </Button>
                )}
                <small>MP4 or WebM · Up to 100 MB</small>
              </div>
            )}
          </div>
          <Input
            ref={input}
            type="file"
            accept="video/*"
            aria-label={
              exercise === "auto"
                ? "Upload exercise video for automatic detection"
                : `Upload ${definition.label.toLowerCase()} video`
            }
            hidden
            disabled={busy}
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {(url || synthetic) && (
            <div className="video-actions">
              <Button
                variant="unstyled"
                className="toggle"
                aria-pressed={overlay}
                onClick={() => setOverlay(!overlay)}
              >
                <span aria-hidden="true">{overlay ? "●" : "○"}</span> Pose
                overlay
              </Button>
              <div>
                <Button
                  variant="quiet"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  Change clip
                </Button>
                {file && (
                  <Button variant="primary" disabled={busy} onClick={analyze}>
                    {busy
                      ? "Analyzing…"
                      : result
                        ? "Analyze again"
                        : "Analyze clip"}
                  </Button>
                )}
              </div>
            </div>
          )}
          {busy && (
            <div className="progress" role="status">
              <div className="progress-copy">
                <span>{status}</span>
                <strong>{progress}%</strong>
              </div>
              <div className="progress-bar" aria-hidden="true">
                <span style={{ width: progress + "%" }} />
              </div>
              <Button variant="quiet" onClick={() => abort.current?.abort()}>
                Cancel
              </Button>
            </div>
          )}
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <p className="recording-caption">
            {synthetic
              ? "A generated sample for exploring the review tools."
              : "Your video stays on your device during movement analysis."}
          </p>
        </section>
        {analysis && (
          <aside className="session-review" aria-labelledby="set-title">
            <h2 id="set-title">This set</h2>
            <div className="rep-summary">
              {result?.classification && (
                <div
                  className="rep-summary-exercise"
                  aria-label="Identified exercise"
                >
                  <h3>{definition.label}</h3>
                  <p>
                    {result.classification.needsConfirmation
                      ? `If this isn't a ${definition.label.toLowerCase()}, change it below before you lean on the numbers.`
                      : "Wrong exercise? Change it here."}
                  </p>
                  <label htmlFor="detected-exercise">Exercise</label>
                  <Select
                    id="detected-exercise"
                    value={analysis.exercise}
                    onValueChange={(next) =>
                      correctExercise(next as ExerciseId)
                    }
                  >
                    {(
                      [
                        "squat",
                        "pushup",
                        "lunge",
                        "deadlift",
                        "plank",
                      ] as ExerciseId[]
                    ).map((id) => (
                      <option value={id} key={id}>
                        {getExerciseDefinition(id).label}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {cyclic ? (
                <div className="rep-summary-count">
                  <strong>{analysis.reps?.length ?? 0}</strong>
                  <div>
                    <span>repetitions detected</span>
                    <small>
                      {analysis.duration.toFixed(1)} seconds of video
                    </small>
                  </div>
                </div>
              ) : (
                <div className="rep-summary-count">
                  <strong>
                    {hold ? hold.totalGoodFormSeconds.toFixed(1) : "—"}
                  </strong>
                  <div>
                    <span>seconds in good form</span>
                    <small>
                      {hold
                        ? "of " +
                          hold.totalTrackedSeconds.toFixed(1) +
                          "s tracked, " +
                          analysis.duration.toFixed(1) +
                          "s total"
                        : analysis.duration.toFixed(1) + "s total"}
                    </small>
                  </div>
                </div>
              )}
              <div className="tracking">
                <span aria-hidden="true">◉</span>
                <p>
                  {"Body tracked in " +
                    Math.round(analysis.coverage * 100) +
                    "% of frames"}
                  <small>
                    Tracking coverage describes visibility, not form quality.
                  </small>
                </p>
              </div>
            </div>
            <div className="coaching">
              <h3>
                Coaching notes
                <HelpHint>
                  Joint notes come from on-device travel, speed, and acceleration plus a small coach model. Picture notes, when connected, still use a few stills. Neither path is medical advice. Video never leaves this device for the joint review.
                </HelpHint>
              </h3>
              {jointBusy && !jointCoach && (
                <p>Reading which joints did the work…</p>
              )}
              {jointCoach ? (
                <div className="coaching-strengths">
                  <p className="coaching-source">Joint attention</p>
                  <p>{jointCoach.summary}</p>
                  {jointCoach.movers.map((mover) => (
                    <p key={mover.joint}>
                      {mover.joint}: {mover.takeaway}
                    </p>
                  ))}
                  <p className="coaching-source">Watch these joints</p>
                  {jointCoach.attention.map((item) => (
                    <p key={item.joint}>
                      {item.joint}: {item.why} {item.cue}
                    </p>
                  ))}
                </div>
              ) : null}
              {canAskJointCoach && (
                <Button
                  variant="outline"
                  disabled={jointConfigured === false || jointBusy}
                  onClick={() => {
                    if (result) void requestJointCoach(result);
                  }}
                >
                  {jointBusy
                    ? "Reading joints…"
                    : jointCoach
                      ? "Review joints again"
                      : "Review joints"}
                </Button>
              )}
              {canAskJointCoach && jointConfigured === false && (
                <small>
                  Joint coaching is not connected yet. Local tracking still
                  runs on this device.
                </small>
              )}
              {jointError && (
                <p className="message error" role="alert">
                  {jointError}
                </p>
              )}
              {coachBusy && !coaching && (
                <p>Reading the set for specific coaching…</p>
              )}
              {coaching ? (
                <>
                  <p>{coaching.summary}</p>
                  {coaching.strengths.length > 0 && (
                    <div className="coaching-strengths">
                      <p className="coaching-source">Doing well</p>
                      {coaching.strengths.map((strength, i) => (
                        <p key={i}>
                          <Button
                            variant="link"
                            onClick={() => jump(strength.timestamp)}
                          >
                            {clock(strength.timestamp)}
                          </Button>{" "}
                          {strength.observation}
                        </p>
                      ))}
                    </div>
                  )}
                  {coaching.cues.length > 0 && (
                    <p className="coaching-source">Next set</p>
                  )}
                  {coaching.cues.map((c, i) => (
                    <p key={i}>
                      <Button variant="link" onClick={() => jump(c.timestamp)}>
                        {clock(c.timestamp)}
                      </Button>{" "}
                      {c.observation} {c.suggestion}
                    </p>
                  ))}
                </>
              ) : analysis.cues.length ? (
                analysis.cues.slice(0, 3).map((cue) => <p key={cue}>{cue}</p>)
              ) : (
                <p>No extra coaching notes for this set.</p>
              )}
              {canAskCoach && (
                <Button
                  variant="outline"
                  disabled={!coachConfigured || coachBusy}
                  onClick={() => {
                    if (result) void requestCoaching(result);
                  }}
                >
                  {coachBusy
                    ? "Reviewing…"
                    : coaching
                      ? "Review again"
                      : "Get coaching"}
                </Button>
              )}
              {canAskCoach && coachConfigured === false && (
                <small>
                  Written coaching is not connected yet. Your local review is
                  available.
                </small>
              )}
              {coachError && (
                <p className="message error" role="alert">
                  {coachError}
                </p>
              )}
              {voiceConfigured ? (
                <Button
                  variant="outline"
                  disabled={speaking}
                  onClick={() => {
                    stopSpeech();
                    speak(
                      jointCoach
                        ? jointCoachSpeechText(jointCoach)
                        : coaching
                          ? coachingSpeechText(coaching)
                          : analysisSpeechText(analysis, result?.classification),
                    );
                  }}
                >
                  {speaking ? "Speaking…" : "Hear this review"}
                </Button>
              ) : voiceConfigured === false ? (
                <small>
                  A coaching voice is not connected yet. Set
                  ELEVENLABS_API_KEY in .env.local to hear this review.
                </small>
              ) : null}
            </div>
          </aside>
        )}
      </div>
      {analysis && (
        <section className="rep-section" aria-labelledby="rep-title">
          <div className="section-heading">
            <div>
              <h2 id="rep-title">
                {cyclic ? "Repetitions" : "The hold"}
                <HelpHint>
                  {cyclic
                    ? "Each repetition is one bend-and-return cycle measured against your resting position. Pick one to see its frames and timing."
                    : "Good-form time is how much of the tracked clip held a straight body line within tolerance. A break is where that line left it."}
                </HelpHint>
              </h2>
            </div>
            <p>
              {cyclic
                ? analysis.reps!.length +
                  " detected · " +
                  averageTime.toFixed(1) +
                  "s average cycle"
                : (hold?.formBreaks ?? 0) +
                  " form break" +
                  (hold?.formBreaks === 1 ? "" : "s") +
                  " · " +
                  (hold?.longestGoodFormSeconds ?? 0).toFixed(1) +
                  "s longest straight segment"}
            </p>
          </div>
          {cyclic && Boolean(analysis?.reps?.length) && (
            <div className="rep-tabs" aria-label="Select a repetition">
              {analysis?.reps?.map((r, i) => (
                <Button
                  variant="unstyled"
                  aria-pressed={selected === i}
                  className={selected === i ? "selected" : ""}
                  key={r.start}
                  onClick={() => selectRep(i)}
                >
                  <span>REP {String(i + 1).padStart(2, "0")}</span>
                  <small>
                    {clock(r.start)}–{clock(r.end)}
                  </small>
                </Button>
              ))}
            </div>
          )}
          {analysis && (
            <div className="timeline">
              <div className="chart-title">
                <span>{definition.label} tracking angle</span>
                <small>Lower on the graph = deeper into the movement</small>
              </div>
              <div className="chart">
                <div className="y-axis">
                  <span>180°</span>
                  <span>90°</span>
                  <span>0°</span>
                </div>
                <svg
                  viewBox="0 0 1000 200"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Tracking angle over the clip; details are available below"
                >
                  <line x1="0" x2="1000" y1="10" y2="10" />
                  <line x1="0" x2="1000" y1="100" y2="100" />
                  <line x1="0" x2="1000" y1="190" y2="190" />
                  {cyclic &&
                    analysis.reps?.map((r, i) => (
                      <rect
                        key={i}
                        x={(r.start / analysis.duration) * 1000}
                        width={((r.end - r.start) / analysis.duration) * 1000}
                        y="0"
                        height="200"
                        fill={
                          selected === i
                            ? "var(--chart-selected)"
                            : "var(--surface-inset)"
                        }
                        opacity=".75"
                      />
                    ))}
                  {!cyclic &&
                    hold?.segments.map((s, i) => (
                      <rect
                        key={i}
                        x={(s.start / analysis.duration) * 1000}
                        width={((s.end - s.start) / analysis.duration) * 1000}
                        y="0"
                        height="200"
                        fill={s.formOk ? "var(--chart-selected)" : "var(--rose)"}
                        opacity=".75"
                      />
                    ))}
                  {paths.map((d, i) => (
                    <path
                      key={i}
                      d={d}
                      stroke="var(--clay)"
                      strokeWidth="3"
                      fill="none"
                    />
                  ))}
                  <line
                    x1={(time / analysis.duration) * 1000}
                    x2={(time / analysis.duration) * 1000}
                    y1="0"
                    y2="200"
                    className="cursor"
                  />
                </svg>
              </div>
              <div className="x-axis">
                {[0, 0.25, 0.5, 0.75, 1].map((n) => (
                  <span key={n}>{(analysis.duration * n).toFixed(1)}s</span>
                ))}
              </div>
            </div>
          )}
          {rep && (
            <div className="selected-review">
              <div className="rep-measurements">
                <div>
                  <span>Rep {selected + 1} · deepest position</span>
                  <strong>
                    {Math.round(rep.minPrimary)}
                    <small>°</small>
                  </strong>
                  <p>Camera-view estimate</p>
                </div>
                <div>
                  <span>Lowering</span>
                  <strong>
                    {rep.descent.toFixed(1)}
                    <small>s</small>
                  </strong>
                  <p>Start to deepest position</p>
                </div>
                <div>
                  <span>Rising</span>
                  <strong>
                    {rep.ascent.toFixed(1)}
                    <small>s</small>
                  </strong>
                  <p>Deepest position to return</p>
                </div>
              </div>
              {Boolean(selectedFrames?.length) && (
                <div className="contact-sheet">
                  {selectedFrames?.map((f, i) => (
                    <Button
                      variant="unstyled"
                      key={i}
                      onClick={() => jump(f.time)}
                    >
                      <picture>
                        <img
                          src={f.image}
                          alt={f.label + " at " + clock(f.time)}
                        />
                      </picture>
                      <span>
                        {["Start", "Deepest position", "Return"][i]}
                        <small>{clock(f.time)}</small>
                      </span>
                    </Button>
                  ))}
                </div>
              )}
              <p className="measurement-note">
                A front or angled camera can change these measurements. Review the
                video before drawing conclusions about technique.
              </p>
            </div>
          )}
          {!cyclic && hold && hold.totalTrackedSeconds > 0 && (
            <div className="selected-review">
              <div className="rep-measurements">
                <div>
                  <span>Good-form time</span>
                  <strong>
                    {hold.totalGoodFormSeconds.toFixed(1)}
                    <small>s</small>
                  </strong>
                  <p>Of {hold.totalTrackedSeconds.toFixed(1)}s tracked</p>
                </div>
                <div>
                  <span>Longest straight segment</span>
                  <strong>
                    {hold.longestGoodFormSeconds.toFixed(1)}
                    <small>s</small>
                  </strong>
                  <p>Continuous, uninterrupted</p>
                </div>
                <div>
                  <span>Form breaks</span>
                  <strong>{hold.formBreaks}</strong>
                  <p>Times the line left straight</p>
                </div>
              </div>
              {Boolean(result?.keyframes.length) && (
                <div className="contact-sheet">
                  {result?.keyframes.map((f, i) => (
                    <Button
                      variant="unstyled"
                      key={i}
                      onClick={() => jump(f.time)}
                    >
                      <picture>
                        <img
                          src={f.image}
                          alt={f.label + " at " + clock(f.time)}
                        />
                      </picture>
                      <span>
                        {f.label}
                        <small>{clock(f.time)}</small>
                      </span>
                    </Button>
                  ))}
                </div>
              )}
              <p className="measurement-note">
                A front or angled camera can change these measurements. Review the
                video before drawing conclusions about technique.
              </p>
            </div>
          )}
          {analysis && (
            <details className="method-details">
              <summary>How this was measured</summary>
              <p>
                {cyclic
                  ? "The detector looks for a visible bend-and-return cycle relative to your resting position. Smaller depth or faster tempo does not remove a repetition."
                  : "The detector tracks how much of the clip held a straight body line within a tolerance, and reports the longest unbroken stretch."}
              </p>
              <p>
                {analysis.baseline !== null
                  ? "Reference angle: " + analysis.baseline.toFixed(1) + "°. "
                  : ""}
                Missing tracking breaks a cycle or a hold segment.
              </p>
              {analysis.notes.map((n, i) => (
                <p key={i}>
                  {clock(n.start)}–{clock(n.end)}: {n.reason.replaceAll("_", " ")}{" "}
                  excluded.
                </p>
              ))}
              {analysis.cues.map((c) => (
                <p key={c}>{c}</p>
              ))}
            </details>
          )}
          <div className="task-handoff">
            <p className="handoff-note">
              The video stays on this device. Only the summary travels.
            </p>
            <div className="task-handoff-actions">
              <Button variant="quiet" onClick={exportAnalysis}>
                Export analysis
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
