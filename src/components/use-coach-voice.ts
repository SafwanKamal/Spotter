"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { enqueueLiveCue, PREVIEW_COACH_CUE } from "@/lib/coach-voice";

export function useCoachVoice() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  const voiceOnRef = useRef(voiceOn);
  const configuredRef = useRef(configured);
  const queueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const pendingRef = useRef<string | null>(null);
  const unlockRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);
  useEffect(() => {
    configuredRef.current = configured;
  }, [configured]);

  useEffect(() => {
    fetch("/api/speak")
      .then((response) => response.json())
      .then((payload) => setConfigured(Boolean(payload.configured)))
      .catch(() => setConfigured(false));
  }, []);

  const releaseAudio = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stopSpeech = useCallback(() => {
    generationRef.current += 1;
    queueRef.current = [];
    pendingRef.current = null;
    playingRef.current = false;
    releaseAudio();
    setSpeaking(false);
  }, [releaseAudio]);

  const playNext = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    const generation = generationRef.current;
    setSpeaking(true);
    try {
      while (queueRef.current.length && generation === generationRef.current) {
        const text = queueRef.current.shift();
        if (!text) continue;
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const response = await fetch("/api/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          });
          if (!response.ok || generation !== generationRef.current) continue;
          const blob = await response.blob();
          if (generation !== generationRef.current) return;
          const url = URL.createObjectURL(blob);
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = url;
          await new Promise<void>((resolve) => {
            const audio = audioRef.current ?? new Audio();
            audioRef.current = audio;
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.src = url;
            audio.play().catch(() => resolve());
          });
        } catch {
          // A missed cue is not worth surfacing as an error; text cues remain visible.
        }
      }
    } finally {
      if (generation === generationRef.current) {
        playingRef.current = false;
        setSpeaking(false);
      }
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      const next = text.trim();
      if (!next || !voiceOnRef.current) return;
      if (configuredRef.current !== true) {
        pendingRef.current = next;
        return;
      }
      pendingRef.current = null;
      queueRef.current = enqueueLiveCue(queueRef.current, next);
      void playNext();
    },
    [playNext],
  );

  useEffect(() => {
    if (configured === false) {
      pendingRef.current = null;
      return;
    }
    if (configured !== true || !pendingRef.current || !voiceOnRef.current)
      return;
    const next = pendingRef.current;
    pendingRef.current = null;
    queueRef.current = enqueueLiveCue(queueRef.current, next);
    void playNext();
  }, [configured, playNext]);

  const preview = useCallback(() => {
    if (!configuredRef.current) return;
    queueRef.current = enqueueLiveCue([], PREVIEW_COACH_CUE);
    void playNext();
  }, [playNext]);

  const prime = useCallback(() => {
    const unlock = unlockRef.current ?? new Audio();
    unlockRef.current = unlock;
    unlock.src =
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    void unlock.play().catch(() => {});
  }, []);

  const setVoiceEnabled = useCallback(
    (on: boolean) => {
      setVoiceOn(on);
      if (!on) stopSpeech();
    },
    [stopSpeech],
  );

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  return {
    configured,
    voiceOn,
    speaking,
    speak,
    preview,
    prime,
    stopSpeech,
    setVoiceOn: setVoiceEnabled,
  };
}
