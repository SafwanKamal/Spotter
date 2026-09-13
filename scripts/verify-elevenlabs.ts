import { readFile } from "node:fs/promises";
import { synthesizeSpeech } from "../src/lib/elevenlabs";

if (process.env.RUN_ELEVENLABS_LIVE !== "1") {
  throw new Error(
    "Set RUN_ELEVENLABS_LIVE=1 to opt in to a short ElevenLabs speech request.",
  );
}

async function loadLocalEnv() {
  const text = await readFile(".env.local", "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1).replace(/^['"]|['"]$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  await loadLocalEnv();
  const speech = await synthesizeSpeech("Rep 1. Good depth that rep.");
  const reader = speech.stream.getReader();
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
  }
  if (bytes < 100) {
    throw new Error(`ElevenLabs returned too little audio (${bytes} bytes).`);
  }
  if (!speech.contentType.includes("audio")) {
    throw new Error(`Unexpected content type: ${speech.contentType}`);
  }
  console.log(
    `ElevenLabs speech ok: ${bytes} bytes, ${speech.contentType}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
