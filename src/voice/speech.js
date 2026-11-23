import { TextToSpeech } from "@capacitor-community/text-to-speech";

// Android: native TextToSpeech via the Capacitor plugin.
// Desktop browser (dev): the plugin falls back to the Web Speech API.

export async function speak(text, { rate = 1, volume = 1, lang, voiceIndex, interrupt = false }) {
  await TextToSpeech.speak({
    text,
    lang: lang || "en-US",
    rate,
    pitch: 1,
    volume,
    voice: typeof voiceIndex === "number" && voiceIndex >= 0 ? voiceIndex : undefined,
    queueStrategy: interrupt ? 1 : 0, // 1 = flush: urgent warnings cut in
  });
}

export async function stopSpeaking() {
  try { await TextToSpeech.stop(); } catch { /* ignore */ }
}

export async function listVoices() {
  try {
    const { voices } = await TextToSpeech.getSupportedVoices();
    return (voices || []).map((v, index) => ({ index, name: v.name, lang: v.lang }));
  } catch {
    return [];
  }
}
