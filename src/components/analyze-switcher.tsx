"use client";

import { useState } from "react";
import ExerciseReview from "@/components/exercise-review";
import LiveCameraCoach from "@/components/live-camera-coach";
import { Select } from "@/components/ui/field";
import { EXERCISE_LIBRARY } from "@/lib/exercises/engine";
import type { ExerciseId } from "@/lib/exercises/types";

const EXERCISE_IDS: ExerciseId[] = [
  "squat",
  "pushup",
  "lunge",
  "deadlift",
  "plank",
];

type Mode = "upload" | "live";

// Uploaded clips use automatic exercise recognition. Live coaching still needs
// an explicit exercise because recognition currently evaluates complete clips.
export default function AnalyzeSwitcher() {
  const [mode, setMode] = useState<Mode>("upload");
  const [liveExercise, setLiveExercise] = useState<ExerciseId>("squat");

  return (
    <div>
      <div className="exercise-family-picker">
        <div
          className="segmented mode-toggle"
          role="tablist"
          aria-label="Upload a clip or use a live camera"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            onClick={() => setMode("upload")}
          >
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
              <path d="M10 13V4M10 4 6.5 7.5M10 4l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 13v1.5A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Upload a clip
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "live"}
            onClick={() => setMode("live")}
          >
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
              <rect x="2.5" y="5.5" width="10" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="m15.5 8.3 2-1.4v6.2l-2-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            Live camera
          </button>
        </div>
        {mode === "live" && (
          <label className="live-exercise-select">
            <span>Exercise</span>
            <Select
              value={liveExercise}
              onValueChange={(next) => setLiveExercise(next as ExerciseId)}
            >
              {EXERCISE_IDS.map((id) => (
                <option key={id} value={id}>
                  {EXERCISE_LIBRARY[id].label}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>
      {mode === "upload" ? (
        <ExerciseReview exercise="auto" />
      ) : (
        <LiveCameraCoach key={`${liveExercise}-live`} exercise={liveExercise} />
      )}
    </div>
  );
}
