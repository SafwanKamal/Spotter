import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { coachingSchema } from "../src/lib/coaching";
import { detectReps } from "../src/lib/rep-detector";

const videoPath = process.env.SQUAT_CLIP;
if (process.env.RUN_GEMINI_LIVE !== "1" || !videoPath)
  throw new Error(
    "Set RUN_GEMINI_LIVE=1 and SQUAT_CLIP to opt in to sending six selected frames to Gemini.",
  );

type TraceFixture = {
  duration: number;
  samples: Array<[time: number, knee: number | null, lean: number | null]>;
};

async function main() {
  const fixture = JSON.parse(
    await readFile("tests/fixtures/front-squat-trace.json", "utf8"),
  ) as TraceFixture;
  const measurements = fixture.samples.map(([time, knee, lean]) => ({
    time,
    knee,
    lean,
  }));
  const { reps } = detectReps(measurements);
  if (reps.length !== 5)
    throw new Error(`Expected five fixture reps, received ${reps.length}.`);

  const selected = [
    { time: reps[0].start, label: "Set start" },
    ...reps.map((rep, index) => ({
      time: rep.bottom,
      label: `Rep ${index + 1} · bottom`,
    })),
  ];
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent('<input id="clip" type="file" accept="video/*">');
    await page.locator("#clip").setInputFiles(videoPath!);
    await page.evaluate(
      "globalThis.__name = function(target) { return target; }",
    );
    const keyframes = await page.evaluate(
      async ({ selected }) => {
        const input = document.querySelector<HTMLInputElement>("#clip");
        const file = input?.files?.[0];
        if (!file)
          throw new Error("The browser did not receive the video file.");
        const video = document.createElement("video");
        const url = URL.createObjectURL(file);
        video.muted = true;
        video.playsInline = true;
        video.src = url;
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadeddata", () => resolve(), { once: true });
          video.addEventListener(
            "error",
            () => reject(new Error("Video decode failed.")),
            {
              once: true,
            },
          );
        });
        const scale = Math.min(
          1,
          640 / Math.max(video.videoWidth, video.videoHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable.");

        const output = [];
        for (const frame of selected) {
          await new Promise<void>((resolve, reject) => {
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
            video.currentTime = frame.time;
          });
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          output.push({
            ...frame,
            image: canvas.toDataURL("image/jpeg", 0.72),
          });
        }
        URL.revokeObjectURL(url);
        return output;
      },
      { selected },
    );

    const response = await fetch("http://127.0.0.1:3000/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        duration: fixture.duration,
        coverage: 1,
        reps,
        keyframes,
      }),
    });
    const body: unknown = await response.json();
    if (!response.ok)
      throw new Error(`Gemini coaching returned HTTP ${response.status}.`);
    const coaching = coachingSchema.parse(body);
    console.log(
      JSON.stringify(
        {
          status: response.status,
          framesSent: keyframes.map(({ label, time }) => ({ label, time })),
          coaching,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
