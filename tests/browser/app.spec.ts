import { test, expect } from "./support/signed-in";
import AxeBuilder from "@axe-core/playwright";

test("video picker and drop zone accept a clip after hydration", async ({
  page,
}) => {
  await page.goto("/analyze");
  await page.getByLabel("Upload exercise video for automatic detection").setInputFiles({
    name: "picker.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("fixture"),
  });
  await expect(
    page.getByRole("button", { name: "Analyze clip" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Automatically identify your exercise." }),
  ).toBeVisible();
  await page.locator(".upload-content").evaluate((target) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["fixture"], "dropped.mp4", { type: "video/mp4" }),
    );
    target.dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
    );
  });
  await expect(
    page.getByRole("button", { name: "Analyze clip" }),
  ).toBeVisible();
});

test("sample analysis, timeline, export, and mobile layout", async ({
  page,
}) => {
  await page.route("**/api/speak", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { configured: true } });
    }
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
      body: Buffer.from("id3"),
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/analyze");
  await expect(
    page.getByRole("heading", { name: "Automatically identify your exercise." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Explore recognition sample" }).click();
  await expect(page.getByText("SYNTHETIC LANDMARK SAMPLE")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Keep a public receipt" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /REP 0/ })).toHaveCount(3);
  await page.getByRole("button", { name: /REP 02/ }).click();
  await expect(page.getByRole("button", { name: /REP 02/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export analysis" }).click();
  expect((await download).suggestedFilename()).toMatch(/^pushup-analysis-.*\.json$/);
  await page.screenshot({ path: "test-results/sample.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("automatic recognition classifies a clip and keeps the label correctable", async ({
  page,
}) => {
  await page.route("**/api/speak", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { configured: true } });
    }
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
      body: Buffer.from("id3"),
    });
  });
  await page.goto("/analyze");
  await expect(
    page.getByRole("heading", { name: "Movement review" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Explore recognition sample" })
    .click();
  await expect(
    page.getByLabel("Identified exercise").getByRole("heading", { name: "Push-up" }),
  ).toBeVisible();
  await expect(page.getByLabel("Identified exercise")).not.toContainText("%");
  await expect(page.getByLabel("Exercise", { exact: true })).toHaveText(
    "Push-up",
  );
  await page.getByLabel("Exercise", { exact: true }).click();
  await page.getByRole("option", { name: "Plank" }).click();
  await expect(
    page.getByLabel("Identified exercise").getByRole("heading", { name: "Plank" }),
  ).toBeVisible();
  await expect(page.getByLabel("Exercise", { exact: true })).toHaveText("Plank");
});

test("primary tasks have focused routes and shared navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Let's start the week." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Record", exact: true })).toHaveAttribute("href", "/analyze");

  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Replay", exact: true }).click();
  await expect(page).toHaveURL(/\/replay$/);
  await expect(
    page.getByRole("heading", { name: "Motion replay" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole("link", { name: /Rewards Your session points/ }).click();
  await expect(page).toHaveURL(/\/rewards$/);
  await expect(
    page.getByRole("heading", {
      name: "A little credit for showing up.",
    }),
  ).toBeVisible();
  await expect(page.getByText("No session is attached yet.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Working integration examples" }),
  ).toBeVisible();
});

test("community feed filters posts and keeps one local upvote", async ({
  page,
}) => {
  await page.goto("/social");
  await expect(
    page.getByRole("heading", { name: "Community" }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(3);

  await page.getByLabel("Exercise").selectOption("Squat");
  await expect(page.getByRole("article")).toHaveCount(1);
  const upvote = page.getByRole("button", {
    name: "Upvote Brace before you chase depth",
  });
  await expect(upvote).toContainText("482");
  await upvote.click();
  await expect(
    page.getByRole("button", {
      name: "Remove upvote from Brace before you chase depth",
    }),
  ).toContainText("483");

  await page.reload();
  await page.getByLabel("Exercise").selectOption("Squat");
  await expect(
    page.getByRole("button", {
      name: "Remove upvote from Brace before you chase depth",
    }),
  ).toContainText("483");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("public demo endpoints are retired", async ({ request }) => {
  expect((await request.get("/api/rewards/demo")).status()).toBe(410);
  expect((await request.post("/api/rewards/proof", {data:{}})).status()).toBe(410);
});

test("malformed and oversized API input are rejected", async ({ request }) => {
  expect(
    (await request.post("/api/coach", { data: { duration: -1 } })).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/coach", { data: "x".repeat(2_000_001) })
    ).status(),
  ).toBe(413);
  expect(
    (await request.post("/api/motion", { data: { duration: 30 } })).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/motion", {
        data: { duration: 4, variant: "front-squat" },
      })
    ).status(),
  ).toBe(200);
});

test("the motion section explains its limits and opens a local BVH", async ({
  page,
}) => {
  let speakPosts = 0;
  await page.route("**/api/speak", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { configured: true } });
    }
    speakPosts += 1;
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
      body: Buffer.from("id3"),
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/replay");
  await expect(
    page.getByRole("heading", { name: "Motion replay" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate with Kimodo" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Generate with Kimodo" }).click();
  await expect(
    page.locator("canvas[aria-label='3D skeletal motion viewer']"),
  ).toBeVisible();
  await expect(page.getByText(/Cached Front squat demonstration/)).toBeVisible();
  await expect(page.getByText("Watch these joints")).toBeVisible();
  await expect(page.getByText("Press Play to hear the coach.")).toBeVisible();
  await expect(page.getByRole("button", { name: /elbows/i })).toBeVisible();
  await page.getByRole("button", { name: /elbows/i }).click();
  await expect(page.getByRole("button", { name: /elbows/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(speakPosts).toBe(0);
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(
    page.getByRole("button", { name: "Pause replay" }),
  ).toBeVisible();
  await expect.poll(() => speakPosts).toBe(1);
  await page
    .getByLabel("Import BVH animation")
    .setInputFiles("tests/fixtures/simple-squat.bvh");
  await expect(page.getByText(/Imported animation/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("real video decoding and MediaPipe inference reject an empty scene", async ({
  page,
}) => {
  await page.goto("/analyze");
  // A generated blank video tests the real decoder/model path without using private gym footage.
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(15),
      recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    const complete = new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    });
    recorder.start();
    const interval = setInterval(() => {
      ctx.fillStyle = "#202820";
      ctx.fillRect(0, 0, 320, 240);
    }, 60);
    await new Promise((resolve) => setTimeout(resolve, 3300));
    recorder.stop();
    clearInterval(interval);
    stream.getTracks().forEach((t) => t.stop());
    return Array.from(new Uint8Array(await (await complete).arrayBuffer()));
  });
  await page.getByLabel("Upload exercise video for automatic detection").setInputFiles({
    name: "blank.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(bytes),
  });
  await page.getByRole("button", { name: "Analyze clip" }).click();
  await expect(page.getByText("Body tracked in 0% of frames")).toBeVisible({
    timeout: 100000,
  });
  await expect(page.getByRole("button", { name: /REP 0/ })).toHaveCount(0);
});


test("specific exercises use one selector for live coaching", async ({ page }) => {
  await page.goto("/analyze");
  await expect(page.getByRole("tab", { name: "Squat" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Push-up" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Live camera" }).click();
  await page.locator(".live-exercise-select select").selectOption("pushup");
  await expect(page.getByRole("heading", { name: "Push-up · live camera" })).toBeVisible();
});

test("live camera can request a spoken sample when ElevenLabs is configured", async ({
  page,
}) => {
  const posts: string[] = [];
  await page.route("**/api/speak", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { configured: true } });
    }
    posts.push(route.request().postData() ?? "");
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
      body: Buffer.from("id3"),
    });
  });
  await page.goto("/analyze");
  await page.getByRole("tab", { name: "Live camera" }).click();
  await expect(
    page.getByText("Coaching cues are generated locally from your measurements and spoken aloud."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hear a sample" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toContain("Rep 1. Good depth that rep.");
});

test("clip analysis can be heard after a sample review", async ({ page }) => {
  const posts: string[] = [];
  await page.route("**/api/speak", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { configured: true } });
    }
    posts.push(route.request().postData() ?? "");
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
      body: Buffer.from("id3"),
    });
  });
  await page.goto("/analyze");
  await page.getByRole("button", { name: "Explore recognition sample" }).click();
  await expect(page.getByRole("button", { name: "Hear this review" })).toBeVisible();
  await expect.poll(() => posts.some((body) => /push-up/i.test(body))).toBe(true);
  await expect(page.getByRole("button", { name: "Hear this review" })).toBeEnabled();
  const before = posts.length;
  await page.getByRole("button", { name: "Hear this review" }).click();
  await expect.poll(() => posts.length).toBeGreaterThan(before);
});

test("an ended camera feed leaves a restartable preview instead of a black screen", async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        if (!constraints.video) return original(constraints);
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        const context = canvas.getContext("2d");
        context?.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.captureStream(15);
      },
    });
  });
  await page.goto("/analyze");
  await page.getByRole("tab", { name: "Live camera" }).click();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.locator("video")).toBeVisible();
  await page.locator("video").evaluate((video) => {
    const stream = (video as HTMLVideoElement).srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    track.onended?.call(track, new Event("ended"));
  });
  await expect(page.getByRole("heading", { name: "Camera stopped. Your results are saved." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start again" })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({ hasText: "camera feed ended" }),
  ).toBeVisible();
});

test("mobile tab bar includes all five primary destinations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(navigation.getByRole("link")).toHaveCount(5);
  for (const name of ["Today", "Analyze", "Replay", "Community", "Profile"]) {
    await expect(navigation.getByRole("link", { name })).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("profile saves local details and nests rewards under mobile navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Open profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
  await page.getByLabel("Display name").fill("Alex");
  await page.getByLabel("Training focus").selectOption("Improve technique");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved on this device.");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Alex");
  await expect(page.getByLabel("Training focus")).toHaveValue("Improve technique");
  await page.screenshot({ path: "test-results/profile-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(navigation.getByRole("link")).toHaveCount(5);
  await expect(navigation.getByRole("link", { name: "Replay" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  await expect(navigation.getByRole("link", { name: "Rewards" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/profile-mobile.png", fullPage: true });
  await page.goto("/rewards");
  await expect(page).toHaveURL(/\/profile\/rewards$/);
  await expect(navigation.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
});
