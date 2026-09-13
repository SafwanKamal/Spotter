"use client";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";

import { useEffect, useRef, useState } from "react";
import { useCoachVoice } from "@/components/use-coach-voice";
import type { Analysis } from "@/lib/analysis";
import {
  canonicalMotionDuration,
  validateBvh,
  motionResponse,
} from "@/lib/motion";
import {
  listMotionPresets,
  type MotionPresetId,
} from "@/lib/motion-prompts";
import {
  readBrowserMotion,
  writeBrowserMotion,
} from "@/lib/browser-motion-cache";
import {
  jointCoachSpeechText,
  type JointCoachReview,
} from "@/lib/joint-coach";
import {
  bonesForJoint,
  demonstrationCoachNotes,
  highlightSets,
  readJointCoachReview,
} from "@/lib/replay-coach";

const PRESETS = listMotionPresets();
const CUSTOM_VALUE = "custom";

export default function MotionReplay({ analysis }: { analysis?: Analysis }) {
  const [configured, setConfigured] = useState(false),
    [workerConnected, setWorkerConnected] = useState(false),
    [workerSupportsStructured, setWorkerSupportsStructured] = useState(true),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [bvh, setBvh] = useState(""),
    [source, setSource] = useState(""),
    [error, setError] = useState("");
  const [variant, setVariant] = useState<MotionPresetId | typeof CUSTOM_VALUE>(
      "front-squat",
    ),
    [customName, setCustomName] = useState(""),
    [customDescription, setCustomDescription] = useState(""),
    [moveLabel, setMoveLabel] = useState("front squat"),
    [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0),
    [position, setPosition] = useState(0);
  const [review, setReview] = useState<JointCoachReview | null>(null),
    [fromAnalysis, setFromAnalysis] = useState(false),
    [focusedJoint, setFocusedJoint] = useState<string | null>(null);
  const {
    configured: voiceConfigured,
    speaking,
    speak,
    prime,
    stopSpeech,
  } = useCoachVoice();
  const mount = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    cancel = useRef<AbortController | null>(null);
  const playback = useRef({ playing: false, time: 0 });
  const highlightRef = useRef({
    movers: new Set<string>(),
    attention: new Set<string>(),
    focused: new Set<string>(),
  });
  const highlights = review
    ? highlightSets(review)
    : { movers: new Set<string>(), attention: new Set<string>() };
  highlightRef.current = {
    movers: highlights.movers,
    attention: highlights.attention,
    focused: focusedJoint ? new Set(bonesForJoint(focusedJoint)) : new Set(),
  };
  useEffect(() => {
    fetch("/api/motion")
      .then((r) => r.json())
      .then((d) => {
        setConfigured(Boolean(d.configured));
        setWorkerConnected(Boolean(d.worker));
        setWorkerSupportsStructured(Boolean(d.workerSupportsStructured));
      })
      .catch(() => {});
    return () => cancel.current?.abort();
  }, []);
  useEffect(() => {
    if (!bvh) {
      setReview(null);
      setFromAnalysis(false);
      setFocusedJoint(null);
      return;
    }
    const stored = readJointCoachReview();
    if (stored) {
      setReview(stored);
      setFromAnalysis(true);
      setFocusedJoint(null);
      return;
    }
    setReview(demonstrationCoachNotes(variant, moveLabel));
    setFromAnalysis(false);
    setFocusedJoint(null);
  }, [bvh, variant, moveLabel]);
  useEffect(() => {
    if (!bvh || !mount.current) return;
    let stopped = false,
      dispose = () => {};
    async function init() {
      try {
        validateBvh(bvh);
        const THREE = await import("three");
        const { BVHLoader } = await import("three/addons/loaders/BVHLoader.js");
        const { OrbitControls } = await import(
          "three/addons/controls/OrbitControls.js"
        );
        if (stopped || !mount.current) return;
        // WebGL needs resolved colors, not CSS var() strings. Read from the
        // viewer so both global tokens and scoped theme overrides apply.
        const theme = getComputedStyle(mount.current);
        const color = (token: string) => theme.getPropertyValue(token).trim();
        const animation = new BVHLoader().parse(bvh),
          scene = new THREE.Scene();
        scene.background = new THREE.Color(color("--replay-surface"));
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        const host = mount.current;
        host.appendChild(renderer.domElement);
        renderer.domElement.setAttribute(
          "aria-label",
          "3D skeletal motion viewer",
        );
        const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
        camera.position.set(3, 1.7, 3.5);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0.95, 0);
        controls.enablePan = false;
        controls.minDistance = 1;
        controls.maxDistance = 8;
        const group = new THREE.Group(),
          root = animation.skeleton.bones[0];
        group.add(root);
        scene.add(group);
        const mixer = new THREE.AnimationMixer(root);
        mixer.clipAction(animation.clip).play();
        mixer.setTime(0);
        group.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromPoints(
          animation.skeleton.bones.map((b) =>
            b.getWorldPosition(new THREE.Vector3()),
          ),
        );
        const height = Math.max(0.1, bounds.max.y - bounds.min.y),
          factor = 1.8 / height,
          center = bounds.getCenter(new THREE.Vector3());
        group.scale.setScalar(factor);
        group.position.set(
          -center.x * factor,
          -bounds.min.y * factor,
          -center.z * factor,
        );
        group.updateMatrixWorld(true);
        const helper = new THREE.SkeletonHelper(root);
        const helperMaterial = new THREE.LineBasicMaterial({
          color: color("--replay-bone"),
          depthTest: false,
        });
        helper.material = helperMaterial;
        scene.add(helper);
        const geometry = new THREE.SphereGeometry(0.019, 10, 8),
          restMat = new THREE.MeshBasicMaterial({
            color: color("--replay-bone"),
          }),
          moverMat = new THREE.MeshBasicMaterial({ color: color("--ink") }),
          watchMat = new THREE.MeshBasicMaterial({ color: color("--clay") });
        const markers = animation.skeleton.bones.map(() => {
          const mesh = new THREE.Mesh(geometry, restMat);
          scene.add(mesh);
          return mesh;
        });
        const grid = new THREE.GridHelper(
          5,
          20,
          color("--replay-grid-major"),
          color("--replay-grid-minor"),
        );
        scene.add(grid);
        const resize = new ResizeObserver(() => {
          const w = host.clientWidth,
            h = host.clientHeight;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        });
        resize.observe(host);
        setDuration(animation.clip.duration);
        setPosition(0);
        playback.current = { playing: false, time: 0 };
        setPlaying(false);
        let raf = 0,
          last = performance.now(),
          lastUi = 0;
        const draw = (now: number) => {
          if (stopped) return;
          const dt = Math.min((now - last) / 1000, 0.1);
          last = now;
          if (playback.current.playing)
            playback.current.time =
              (playback.current.time + dt) % animation.clip.duration;
          mixer.setTime(playback.current.time);
          group.updateMatrixWorld(true);
          markers.forEach((mesh, i) => {
            const bone = animation.skeleton.bones[i];
            bone.getWorldPosition(mesh.position);
            const name = bone.name;
            const focused = highlightRef.current.focused.has(name);
            const watch = highlightRef.current.attention.has(name);
            const mover = highlightRef.current.movers.has(name);
            mesh.material =
              focused || watch ? watchMat : mover ? moverMat : restMat;
            mesh.scale.setScalar(
              focused ? 1.85 : watch ? 1.45 : mover ? 1.2 : 1,
            );
          });
          controls.update();
          renderer.render(scene, camera);
          if (now - lastUi > 100) {
            setPosition(playback.current.time);
            lastUi = now;
          }
          raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        dispose = () => {
          cancelAnimationFrame(raf);
          resize.disconnect();
          controls.dispose();
          mixer.stopAllAction();
          mixer.uncacheRoot(root);
          geometry.dispose();
          restMat.dispose();
          moverMat.dispose();
          watchMat.dispose();
          helper.geometry.dispose();
          helperMaterial.dispose();
          grid.geometry.dispose();
          if (Array.isArray(grid.material))
            grid.material.forEach((m) => m.dispose());
          else grid.material.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (e) {
        if (!stopped)
          setError(
            e instanceof Error
              ? e.message
              : "3D rendering is unavailable in this browser.",
          );
      }
    }
    void init();
    return () => {
      stopped = true;
      dispose();
    };
  }, [bvh]);
  function load(text: string, label: string) {
    try {
      validateBvh(text);
      setError("");
      setBvh(text);
      setSource(label);
      setPlaying(false);
      playback.current = { playing: false, time: 0 };
      const stored = readJointCoachReview();
      setReview(stored ?? demonstrationCoachNotes(variant, moveLabel));
      setFromAnalysis(Boolean(stored));
      setFocusedJoint(null);
      stopSpeech();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid animation.");
    }
  }
  async function generate() {
    setError("");
    const requestedDuration = canonicalMotionDuration(analysis?.reps ?? []);
    const isCustom = variant === CUSTOM_VALUE;
    if (isCustom) {
      const name = customName.trim();
      const description = customDescription.trim();
      if (name.length < 2 || description.length < 8) {
        setError(
          "Enter a move name and a short description before generating.",
        );
        return;
      }
    } else {
      const local = readBrowserMotion(variant, requestedDuration);
      if (local) {
        const label =
          PRESETS.find((item) => item.id === variant)?.label ?? variant;
        setMoveLabel(label);
        load(local.bvh, "Cached " + label + " demonstration");
        setStatus("Loaded a cached demonstration.");
        return;
      }
    }
    setBusy(true);
    setStatus(
      isCustom
        ? "Normalizing your move with Gemini…"
        : "Starting motion generation…",
    );
    const controller = new AbortController();
    cancel.current = controller;
    try {
      const body = isCustom
        ? {
            duration: requestedDuration,
            custom: {
              name: customName.trim(),
              description: customDescription.trim(),
            },
          }
        : { duration: requestedDuration, variant };
      let response = await fetch("/api/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let data = await response.json();
      if (!response.ok) throw new Error(data.error);
      let job = motionResponse.parse(data);
      const start = Date.now();
      while (job.status === "queued" || job.status === "running") {
        if (Date.now() - start > 270000)
          throw new Error(
            "Generation took too long. Check the worker before retrying.",
          );
        setStatus(
          job.status === "queued"
            ? "Waiting for the motion worker…"
            : `Kimodo is generating a ${requestedDuration.toFixed(1)}-second demonstration…`,
        );
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(new DOMException("Cancelled", "AbortError"));
          };
          const timer = setTimeout(() => {
            controller.signal.removeEventListener("abort", abort);
            resolve();
          }, 500);
          controller.signal.addEventListener("abort", abort, { once: true });
          if (controller.signal.aborted) abort();
        });
        response = await fetch("/api/motion/" + job.id, {
          signal: controller.signal,
        });
        data = await response.json();
        if (!response.ok) throw new Error(data.error);
        job = motionResponse.parse(data);
      }
      if (job.status === "failed") throw new Error(job.error);
      const label = isCustom
        ? customName.trim()
        : (PRESETS.find((item) => item.id === variant)?.label ?? variant);
      setMoveLabel(label);
      const cacheVariant = isCustom
        ? `custom-${label.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}`
        : variant;
      load(
        job.bvh,
        (job.cached ? "Cached " : "Generated by " + job.model + " · ") +
          label +
          " demonstration",
      );
      writeBrowserMotion({
        variant: cacheVariant,
        duration: requestedDuration,
        model: job.model,
        bvh: job.bvh,
      });
      setStatus(
        job.cached
          ? "Loaded a cached demonstration."
          : "Motion is ready to review.",
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Motion generation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="motion-section" id="motion-replay">
      <div className="section-heading">
        <div>
          <h2>Generated example</h2>
        </div>
        <span className="subtle-tag">3D demonstration</span>
      </div>
      <div className="motion-layout">
        <div>
          {bvh ? (
            <>
              <div ref={mount} className="motion-canvas" />
              <div className="motion-controls">
                <Button
                  variant="quiet"
                  onClick={() => {
                    const next = !playing;
                    playback.current.playing = next;
                    setPlaying(next);
                    if (!next) {
                      stopSpeech();
                      return;
                    }
                    if (!review) return;
                    prime();
                    speak(jointCoachSpeechText(review));
                  }}
                >
                  {playing ? "Pause replay" : "Play replay"}
                </Button>
                <Input
                  aria-label="3D replay timeline"
                  type="range"
                  min="0"
                  max={duration || 1}
                  step=".01"
                  value={position}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    playback.current.time = t;
                    playback.current.playing = false;
                    setPlaying(false);
                    setPosition(t);
                    stopSpeech();
                  }}
                />
                <span>{position.toFixed(1)}s</span>
              </div>
              <p className="recording-caption">
                {source}. Drag to orbit; scroll to zoom.
                {voiceConfigured
                  ? speaking
                    ? " Coach notes are speaking."
                    : " Press Play to hear the coach."
                  : voiceConfigured === false
                    ? " A coaching voice is not connected yet."
                    : ""}
              </p>
              {review && (
                <aside className="coaching motion-coach" aria-live="polite">
                  <h3>Coach callouts</h3>
                  <p className="coaching-source">
                    {fromAnalysis
                      ? "From your last review"
                      : "What to watch on this demonstration"}
                  </p>
                  <div className="coaching-strengths">
                    <p>{review.summary}</p>
                  </div>
                  <p className="coaching-source">Biggest movers</p>
                  {review.movers.map((mover) => (
                    <button
                      type="button"
                      key={"mover-" + mover.joint}
                      className={
                        "coach-statement is-mover" +
                        (focusedJoint === mover.joint ? " is-active" : "")
                      }
                      aria-pressed={focusedJoint === mover.joint}
                      onClick={() =>
                        setFocusedJoint(
                          focusedJoint === mover.joint ? null : mover.joint,
                        )
                      }
                    >
                      <span className="coach-statement-joint">{mover.joint}</span>
                      {mover.takeaway}
                    </button>
                  ))}
                  <p className="coaching-source">Watch these joints</p>
                  {review.attention.map((item) => (
                    <button
                      type="button"
                      key={"watch-" + item.joint}
                      className={
                        "coach-statement is-watch" +
                        (focusedJoint === item.joint ? " is-active" : "")
                      }
                      aria-pressed={focusedJoint === item.joint}
                      onClick={() =>
                        setFocusedJoint(
                          focusedJoint === item.joint ? null : item.joint,
                        )
                      }
                    >
                      <span className="coach-statement-joint">{item.joint}</span>
                      {item.why} {item.cue}
                    </button>
                  ))}
                  <small>
                    Clay marks joints to watch. Darker marks show the biggest
                    movers. Select a statement to enlarge it on the skeleton.
                  </small>
                </aside>
              )}
            </>
          ) : (
            <div className="replay-empty">
              <span aria-hidden="true">↻</span>
              <h3>Nothing loaded yet</h3>
              <p>
                Show a cached squat demonstration, or open a BVH animation to
                explore its movement in 3D.
              </p>
            </div>
          )}
        </div>
        <div className="motion-explanation">
          <h3>Review a generated example</h3>
          <p>
            Pick a preset move or describe your own. Gemini normalizes custom
            names into structured motion JSON, then Kimodo generates from that
            meta.json prompt.
          </p>
          <label htmlFor="variation">Move</label>
          <Select
            id="variation"
            value={variant}
            disabled={busy}
            onValueChange={(next) =>
              setVariant(next as MotionPresetId | typeof CUSTOM_VALUE)
            }
          >
            {PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
            <option value={CUSTOM_VALUE}>Custom move…</option>
          </Select>
          {variant === CUSTOM_VALUE && (
            <div className="motion-custom-fields">
              <label htmlFor="custom-move-name">Move name</label>
              <Input
                id="custom-move-name"
                value={customName}
                disabled={busy}
                maxLength={80}
                placeholder="e.g. kettlebell swing"
                onChange={(e) => setCustomName(e.target.value)}
              />
              <label htmlFor="custom-move-description">Description</label>
              <Textarea
                id="custom-move-description"
                value={customDescription}
                disabled={busy}
                maxLength={500}
                rows={4}
                placeholder="Describe the starting position, the action, and how it finishes."
                onChange={(e) => setCustomDescription(e.target.value)}
              />
            </div>
          )}
          <Button
            variant="primary"
            disabled={!configured || busy}
            onClick={generate}
          >
            {busy ? "Generating…" : "Generate with Kimodo"}
          </Button>
          {configured && workerConnected && !workerSupportsStructured && (
            <p className="connection-note">
              The connected Kimodo worker is outdated. Front squat and bodyweight
              still run, but other moves and custom prompts need the updated
              worker redeployed on the GPU host.
            </p>
          )}
          {configured && !workerConnected && (
            <p className="connection-note">
              Front squat and bodyweight demos still work offline. Live
              generation for other moves needs a connected Kimodo worker.
            </p>
          )}
          {!configured && (
            <p className="connection-note">
              Live generation needs a connected Kimodo worker. You can open a
              BVH animation below to use the viewer now.
            </p>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            Open BVH animation
          </Button>
          <Input
            ref={input}
            hidden
            type="file"
            accept=".bvh"
            aria-label="Import BVH animation"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 2_000_000) {
                setError("Choose a BVH file smaller than 2 MB.");
                return;
              }
              load(await f.text(), "Imported animation · " + f.name);
            }}
          />
          {busy && (
            <div role="status">
              <p>{status}</p>
              <Button
                variant="link"
                onClick={() => {
                  cancel.current?.abort();
                  setStatus(
                    "Stopped waiting. The worker may finish its current job.",
                  );
                }}
              >
                Stop waiting
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="message error">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
