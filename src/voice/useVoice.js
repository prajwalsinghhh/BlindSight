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
  wearableAudio: false, // true = wearable plays warnings, phone stays silent
};

const STABLE_FRAMES = 2;   // same message must persist this many analyses
const URGENT_COOLDOWN_MS = 2000;

export function useVoice(analysis, settings) {
  const [voices, setVoices] = useState([]);
  const [lastSpoken, setLastSpoken] = useState(null);
  const speakingRef = useRef(false);
  const lastTimeRef = useRef(new Map()); // message -> last spoken time
  const candidateRef = useRef({ text: null, count: 0 });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => { listVoices().then(setVoices); }, []);

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
        rate: s.rate, volume: s.volume, lang: s.lang || undefined,
        voiceIndex: voiceIndexFor(s), interrupt: urgent,
      });
    } catch (e) {
      console.error("TTS failed:", e);
    } finally {
      speakingRef.current = false;
    }
  }, [voiceIndexFor]);

  // Announce from REAL analysis only.
  useEffect(() => {
    const s = settingsRef.current;
    if (!s.enabled || s.wearableAudio) return;

    const ann = pickAnnouncement(analysis, s.minLevel);
    if (!ann) { candidateRef.current = { text: null, count: 0 }; return; }

    const c = candidateRef.current;
    candidateRef.current = c.text === ann.text ? { text: ann.text, count: c.count + 1 } : { text: ann.text, count: 1 };
    if (candidateRef.current.count < STABLE_FRAMES) return;

    const urgent = rank(ann.severity) >= rank("DANGER");
    const now = Date.now();
    const cooldown = urgent ? Math.min(s.cooldownSec * 1000, URGENT_COOLDOWN_MS) : s.cooldownSec * 1000;
    const last = lastTimeRef.current.get(ann.text) || 0;
    if (now - last < cooldown) return;
    if (speakingRef.current && !urgent) return; // never talk over a warning, unless urgent

    lastTimeRef.current.set(ann.text, now);
    say(ann.text, urgent);
  }, [analysis, say]);

  // Silence immediately when disabled / handed to the wearable.
  useEffect(() => {
    if (!settings.enabled || settings.wearableAudio) stopSpeaking();
  }, [settings.enabled, settings.wearableAudio]);

  const test = useCallback((text = "Person on your left.") => say(text, true), [say]);

  return { voices, lastSpoken, test };
}
