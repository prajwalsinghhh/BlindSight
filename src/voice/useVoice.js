
import { useCallback, useEffect, useRef, useState } from "react";
import { pickAnnouncement } from "../engine/messages";
import { rank } from "../engine/severity";
import { listVoices, speak, stopSpeaking } from "./speech";

export const DEFAULT_VOICE_SETTINGS = {
  enabled: true,
  rate: 1,
  volume: 1,
  lang: "",          // "" = engine default
  voiceName: "",     // "" = engine default
  cooldownSec: 5,    // same message is not repeated within this time
  minLevel: "CAUTION",
};

const STABLE_FRAMES = 2;
const URGENT_COOLDOWN_MS = 2000;

export function useVoice(analysis, settings) {
  const [voices, setVoices] = useState([]);
  const [lastSpoken, setLastSpoken] = useState(null);
  const speakingRef = useRef(false);
  const lastTimeRef = useRef(new Map());
  const candidateRef = useRef({ text: null, count: 0 });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    listVoices().then(setVoices);
  }, []);

  const voiceIndexFor = useCallback(
    (s) => voices.find((v) => v.name === s.voiceName)?.index,
    [voices]
  );

  const say = useCallback(async (text, urgent = false) => {
    const s = settingsRef.current;
    speakingRef.current = true;
    setLastSpoken({ text, at: Date.now() });

    try {
      await speak(text, {
        rate: s.rate,
        volume: s.volume,
        lang: s.lang || undefined,
        voiceIndex: voiceIndexFor(s),
        interrupt: urgent,
      });
    } catch (e) {
      console.error("TTS failed:", e);
    } finally {
      speakingRef.current = false;
    }
  }, [voiceIndexFor]);

  // Announce from camera-based analysis.
  useEffect(() => {
    const s = settingsRef.current;
    if (!s.enabled) return;

    const ann = pickAnnouncement(analysis, s.minLevel);
    if (!ann) {
      candidateRef.current = { text: null, count: 0 };
      return;
    }

    const c = candidateRef.current;
    candidateRef.current = c.text === ann.text
      ? { text: ann.text, count: c.count + 1 }
      : { text: ann.text, count: 1 };

    if (candidateRef.current.count < STABLE_FRAMES) return;

    const urgent = rank(ann.severity) >= rank("DANGER");
    const now = Date.now();
    const cooldown = urgent
      ? Math.min(s.cooldownSec * 1000, URGENT_COOLDOWN_MS)
      : s.cooldownSec * 1000;

    const last = lastTimeRef.current.get(ann.text) || 0;
    if (now - last < cooldown) return;
    if (speakingRef.current && !urgent) return;

    lastTimeRef.current.set(ann.text, now);
    say(ann.text, urgent);
  }, [analysis, say]);

  // Stop phone speech immediately when voice assistance is disabled.
  useEffect(() => {
    if (!settings.enabled) stopSpeaking();
  }, [settings.enabled]);

  const test = useCallback(
    (text = "Person on your left.") => say(text, true),
    [say]
  );

  return { voices, lastSpoken, test };
}
