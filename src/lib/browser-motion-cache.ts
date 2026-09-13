import { snapMotionDuration, validateBvh } from "./motion";

const STORAGE_KEY = "formchain.motion-cache.v3";
const MAX_ENTRIES = 6;

type BrowserMotionEntry = {
  variant: string;
  duration: number;
  model: string;
  bvh: string;
  savedAt: number;
};

function cacheKey(variant: string, duration: number) {
  return `${variant}-${snapMotionDuration(duration).toFixed(1)}`;
}

function readStore(): Record<string, BrowserMotionEntry> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, BrowserMotionEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, BrowserMotionEntry>) {
  const entries = Object.entries(store).sort(
    (left, right) => right[1].savedAt - left[1].savedAt,
  );
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(Object.fromEntries(entries.slice(0, MAX_ENTRIES))),
  );
}

export function readBrowserMotion(variant: string, duration: number) {
  const store = readStore();
  const exact = store[cacheKey(variant, duration)];
  const fallback = Object.values(store)
    .filter((entry) => entry.variant === variant)
    .sort(
      (left, right) =>
        Math.abs(left.duration - snapMotionDuration(duration)) -
        Math.abs(right.duration - snapMotionDuration(duration)),
    )[0];
  const entry = exact ?? fallback;
  if (!entry) return null;
  try {
    validateBvh(entry.bvh);
    return entry;
  } catch {
    return null;
  }
}

export function writeBrowserMotion(entry: {
  variant: string;
  duration: number;
  model: string;
  bvh: string;
}) {
  if (typeof localStorage === "undefined") return;
  try {
    validateBvh(entry.bvh);
    const store = readStore();
    store[cacheKey(entry.variant, entry.duration)] = {
      ...entry,
      duration: snapMotionDuration(entry.duration),
      savedAt: Date.now(),
    };
    writeStore(store);
  } catch {
    // Ignore quota or validation failures; live playback still works.
  }
}
