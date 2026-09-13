"use client";
import { ButtonLink } from "@/components/ui/button";

import MotionReplay from "@/components/motion-replay";
import { useAnalysisSession } from "@/components/analysis-session";

export default function ReplayWorkspace() {
  const { analysis, ready } = useAnalysisSession();

  return (
    <div className="journal workspace-page replay-page">
      <header className="page-head">
        <div>
          <h1>Motion replay</h1>
          <p>
            Load a cached squat demonstration, import a BVH, or generate one
            when the Kimodo service is connected. Only the analysis summary
            comes across — never the video.
          </p>
        </div>
      </header>

      {ready && !analysis && (
        <aside className="route-notice">
          <div>
            <strong>No movement summary is attached.</strong>
            <p>
              You can still import a BVH, or analyze a clip first to carry its
              repetition count and duration into this workspace.
            </p>
          </div>
          <ButtonLink variant="quiet" href="/analyze">
            Analyze a clip
          </ButtonLink>
        </aside>
      )}

      {analysis && (
        <div className="session-strip" aria-label="Attached movement summary">
          <span>Attached session</span>
          <strong>{analysis.reps.length} complete reps</strong>
          <span>{analysis.duration.toFixed(1)} seconds</span>
          <span>{Math.round(analysis.coverage * 100)}% tracking</span>
        </div>
      )}

      <MotionReplay analysis={analysis ?? undefined} />
    </div>
  );
}
