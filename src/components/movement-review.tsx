"use client";
import { Button, ButtonLink } from "@/components/ui/button";
import { Arrow } from "@/components/ui/arrow";
import { Input } from "@/components/ui/field";
import { HelpHint } from "@/components/ui/help-hint";

import { useEffect, useRef, useState } from "react";
import { analyzeSquats, demoFrames, type PoseFrame } from "@/lib/analysis";
import { estimateCaloriesBurned } from "@/lib/calories";
import { analyzeVideo, type ClipResult } from "@/lib/video";
import { selectCoachingKeyframes, type Coaching } from "@/lib/coaching";
import { useAnalysisSession } from "@/components/analysis-session";
import { updateSessionCoaching } from "@/lib/local-db";

const clock = (t: number) =>
  Math.floor(t / 60) + ":" + (t % 60).toFixed(1).padStart(4, "0");
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
export default function MovementReview() {
  const { setAnalysis: setSharedAnalysis, logSession } = useAnalysisSession();
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState("");
  const [result, setResult] = useState<ClipResult | null>(null),
    [time, setTime] = useState(0),
    [ratio, setRatio] = useState(1);
  const [selected, setSelected] = useState(0),
    [overlay, setOverlay] = useState(true);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [status, setStatus] = useState("");
  const [error, setError] = useState(""),
    [coaching, setCoaching] = useState<Coaching | null>(null),
    [coachBusy, setCoachBusy] = useState(false);
  const [coachError, setCoachError] = useState(""),
    [configured, setConfigured] = useState(false);
  const abort = useRef<AbortController | null>(null),
    coachAbort = useRef<AbortController | null>(null),
    video = useRef<HTMLVideoElement>(null),
    input = useRef<HTMLInputElement>(null);
  const lastSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    fetch("/api/coach")
      .then((r) => r.json())
      .then((r) => setConfigured(r.configured))
      .catch(() => {});
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
    },
    [],
  );
  function reset() {
    coachAbort.current?.abort();
    setCoaching(null);
    setCoachError("");
    setCoachBusy(false);
    setError("");
    setTime(0);
    setSelected(0);
  }
  function choose(f?: File) {
    if (!f || busy) return;
    reset();
    setSharedAnalysis(null);
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
    const frames = demoFrames();
    const analysis = analyzeSquats(frames, 1000, 1000, 12, "synthetic");
    setResult({
      analysis,
      frames,
      keyframes: [],
    });
    setSharedAnalysis(analysis);
    lastSessionIdRef.current =
      analysis.reps.length > 0 ? logSession(analysis) : null;
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
      const nextResult = await analyzeVideo(file, controller.signal, (p, s) => {
        setProgress(p);
        setStatus(s);
      });
      setResult(nextResult);
      setSharedAnalysis(nextResult.analysis);
      lastSessionIdRef.current =
        nextResult.analysis.reps.length > 0
          ? logSession(nextResult.analysis)
          : null;
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Analysis failed. Try again.",
        );
    } finally {
      setBusy(false);
    }
  }
  async function coach() {
    if (!result || result.analysis.source === "synthetic") return;
    setCoachBusy(true);
    setCoachError("");
    const controller = new AbortController();
    coachAbort.current = controller;
    const chosen = selectCoachingKeyframes(
      result.keyframes,
      result.analysis.reps,
    );
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          duration: result.analysis.duration,
          coverage: result.analysis.coverage,
          reps: result.analysis.reps,
          claimedExercise: "squat",
          localNotes: result.analysis.cues.slice(0, 6),
          keyframes: chosen.map(({ time, label, image }) => ({
            time,
            label,
            image,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCoaching(data);
      if (lastSessionIdRef.current) {
        void updateSessionCoaching(lastSessionIdRef.current, data.summary);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setCoachError(e instanceof Error ? e.message : "Coaching failed.");
    } finally {
      if (coachAbort.current === controller) setCoachBusy(false);
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
    const rep = result?.analysis.reps[i];
    if (rep) jump(rep.bottom);
  }
  const analysis = result?.analysis,
    synthetic = analysis?.source === "synthetic",
    rep = analysis?.reps[selected];
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
    if (m.knee === null) {
      if (segment) paths.push(segment);
      segment = "";
    } else
      segment +=
        (segment ? " L" : "M") +
        (m.time / analysis.duration) * 1000 +
        "," +
        (190 - m.knee);
  });
  if (segment) paths.push(segment);
  const averageTime = analysis?.reps.length
    ? analysis.reps.reduce((s, r) => s + r.end - r.start, 0) /
      analysis.reps.length
    : 0;
  // A local, deterministic estimate — never sent through Gemini. See
  // src/lib/calories.ts for why: a calorie count is a numeric claim, and
  // Gemini's role here stays qualitative.
  const calories = analysis
    ? estimateCaloriesBurned({
        exercise: "squat",
        durationSeconds: analysis.duration,
        repCount: analysis.reps.length,
      })
    : null;
  // Everything the review shows, as one file the person owns: measurements,
  // per-rep timing, detection notes and any coaching that came back.
  function exportAnalysis() {
    if (!analysis) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      exercise: analysis.exercise,
      source: analysis.source,
      durationSeconds: analysis.duration,
      trackingCoverage: analysis.coverage,
      movementScore: analysis.movementScore,
      repCount: analysis.reps.length,
      averageCycleSeconds: Number(averageTime.toFixed(2)),
      calories,
      reps: analysis.reps,
      measurements: analysis.measurements,
      detection: analysis.detection ?? null,
      cues: analysis.cues,
      coaching,
    };
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = href;
    link.download =
      "squat-analysis-" +
      new Date().toISOString().slice(0, 19).replaceAll(":", "-") +
      ".json";
    link.click();
    URL.revokeObjectURL(href);
  }
  return (
    <div className="journal page-journal" id="review">
      <header className="page-head">
        <div>
          <h1>Squat review</h1>
          <p>
            {result
              ? "A closer look at the set you just recorded."
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
                <h3>Upload a clip of your set</h3>
                <p>
                  3–30 seconds, filmed from the side.
                  <br />Keep your whole body in frame — start standing, finish
                  standing.
                </p>
                <Button
                  variant="primary"
                  onClick={() => input.current?.click()}
                >
                  Choose a video
                  <Arrow />
                </Button>
                <Button variant="sample" onClick={demo}>
                  Explore a sample
                </Button>
                <small>MP4 or WebM · Up to 100 MB</small>
              </div>
            )}
          </div>
          <Input
            ref={input}
            type="file"
            accept="video/*"
            aria-label="Upload squat video"
            hidden
            disabled={busy}
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {synthetic && (
            <div className="scrubber">
              <span>{clock(time)}</span>
              <Input
                aria-label="Sample timeline"
                type="range"
                min="0"
                max="12"
                step=".0667"
                value={time}
                onChange={(e) => jump(Number(e.target.value))}
              />
              <span>0:12</span>
            </div>
          )}
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
              <strong>{analysis.reps.length}</strong>
              <div>
                <span>repetitions detected</span>
                <small>{analysis.duration.toFixed(1)} seconds of video</small>
              </div>
            </div>
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
            {calories && (
              <div className="tracking">
                <span aria-hidden="true">◎</span>
                <p>
                  {"Roughly " + calories.kcal.toFixed(0) + " kcal for this set"}
                  <small>
                    {"Estimated from a " +
                      calories.met.toFixed(1) +
                      " MET reference value, duration, and " +
                      (calories.assumedBodyWeight
                        ? "an assumed " +
                          Math.round(calories.bodyWeightKg) +
                          " kg body weight"
                        : "your entered body weight") +
                      ". Not a measurement of your actual effort."}
                  </small>
                </p>
              </div>
            )}
            {rep && (
              <div className="focus-note">
                <h3>{"Rep " + (selected + 1)}</h3>
                <p>
                  Compare your lowest position with the start and return. Depth
                  and speed can vary; those reps still belong in your set.
                </p>
                <Button variant="link" onClick={() => jump(rep.bottom)}>
                  Go to lowest position
                  <Arrow direction="down" />
                </Button>
              </div>
            )}
            <div className="coaching">
              <h3>
                Coaching notes
                <HelpHint>
                  Sends up to six frames spanning your set, plus its
                  measurements, for a written coaching debrief. Nothing leaves
                  this device until you press the button.
                </HelpHint>
              </h3>
              {coaching && (
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
              )}
              {!synthetic && (
                <Button
                  variant="outline"
                  disabled={!configured || coachBusy}
                  onClick={coach}
                >
                  {coachBusy
                    ? "Reviewing…"
                    : coaching
                      ? "Review again"
                      : "Get coaching"}
                </Button>
              )}
              {!synthetic && !configured && (
                <small>
                  AI coaching is not connected yet. Your local review is
                  available.
                </small>
              )}
              {coachError && (
                <p className="message error" role="alert">
                  {coachError}
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
      {analysis && (
        <section className="rep-section" aria-labelledby="rep-title">
          <div className="section-heading">
            <div>
              <h2 id="rep-title">
                Repetitions
                <HelpHint>
                  Each repetition is one bend-and-return cycle measured against
                  your upright position. Pick one to see its frames and timing.
                </HelpHint>
              </h2>
            </div>
            <p>
              {analysis.reps.length +
                " detected · " +
                averageTime.toFixed(1) +
                "s average cycle"}
            </p>
          </div>
          {Boolean(analysis?.reps.length) && (
            <div className="rep-tabs" aria-label="Select a repetition">
              {analysis?.reps.map((r, i) => (
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
                <span>Camera-view knee angle</span>
                <small>Lower on the graph = more knee bend</small>
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
                  aria-label="Knee angle over the clip; repetition details are available below"
                >
                  <line x1="0" x2="1000" y1="10" y2="10" />
                  <line x1="0" x2="1000" y1="100" y2="100" />
                  <line x1="0" x2="1000" y1="190" y2="190" />
                  {analysis.reps.map((r, i) => (
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
                  <span>Rep {selected + 1} · lowest position</span>
                  <strong>
                    {Math.round(rep.minKnee)}
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
                  <p>Start to lowest position</p>
                </div>
                <div>
                  <span>Rising</span>
                  <strong>
                    {rep.ascent.toFixed(1)}
                    <small>s</small>
                  </strong>
                  <p>Lowest position to return</p>
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
                        {["Start", "Lowest position", "Return"][i]}
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
              <summary>How these repetitions were counted</summary>
              <p>
                The detector looks for a visible bend-and-return cycle relative to
                your upright position. Smaller depth or faster tempo does not
                remove a repetition.
              </p>
              <p>
                {analysis.detection
                  ? "Reference knee angle: " +
                    analysis.detection.baseline.toFixed(1) +
                    "°. "
                  : ""}
                Missing tracking breaks a cycle. Unfinished movements are
                excluded.
              </p>
              {analysis.detection?.notes.map((n, i) => (
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
        </section>
      )}
      <div className="task-handoff">
        <p className="handoff-note">
          The video stays on this device. Only the summary travels.
        </p>
        <div className="task-handoff-actions">
          {analysis && (
            <Button variant="quiet" onClick={exportAnalysis}>
              Export analysis
            </Button>
          )}
          <ButtonLink variant="quiet" href="/replay">
            Motion replay
          </ButtonLink>
          <ButtonLink variant="quiet" href="/profile">
            Profile
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
