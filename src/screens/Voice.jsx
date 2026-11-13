import { useMemo } from "react";

export default function Voice({ settings, setSettings, voice, headingRef }) {
  const set = (patch) => setSettings({ ...settings, ...patch });
  const langs = useMemo(() => [...new Set(voice.voices.map((v) => v.lang))].sort(), [voice.voices]);
  const shown = voice.voices.filter((v) => !settings.lang || v.lang === settings.lang);
  const silent = !settings.enabled || settings.wearableAudio;

  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>Voice Assistance</h1>

      <button className={`big-toggle ${settings.enabled ? "on" : ""}`} role="switch"
              aria-checked={settings.enabled} onClick={() => set({ enabled: !settings.enabled })}>
        <span>Voice warnings</span>
        <strong>{settings.enabled ? "ON" : "OFF"}</strong>
      </button>

      <button className="btn primary full" onClick={() => voice.test("Person on your left.")}>
        Test voice
      </button>
      <div className="chips">
        {["Obstacle ahead.", "Person on your left.", "Vehicle approaching."].map((t) => (
          <button key={t} className="btn" onClick={() => voice.test(t)}>Say “{t.replace(".", "")}”</button>
        ))}
      </div>

      <div className="field">
        <label htmlFor="rate">Speech rate: {settings.rate.toFixed(1)}×</label>
        <input id="rate" type="range" min="0.5" max="2" step="0.1" value={settings.rate}
               onChange={(e) => set({ rate: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label htmlFor="vol">Volume: {Math.round(settings.volume * 100)}%</label>
        <input id="vol" type="range" min="0.1" max="1" step="0.1" value={settings.volume}
               onChange={(e) => set({ volume: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label htmlFor="cd">Repeat the same warning after: {settings.cooldownSec} s</label>
        <input id="cd" type="range" min="2" max="20" step="1" value={settings.cooldownSec}
               onChange={(e) => set({ cooldownSec: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label htmlFor="min">Speak warnings from level</label>
        <select id="min" value={settings.minLevel} onChange={(e) => set({ minLevel: e.target.value })}>
          <option value="CAUTION">Caution and above</option>
          <option value="WARNING">Warning and above</option>
          <option value="DANGER">Danger only</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="lang">Language</label>
        <select id="lang" value={settings.lang} onChange={(e) => set({ lang: e.target.value, voiceName: "" })}>
          <option value="">Device default</option>
          {langs.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="voice">Voice</label>
        <select id="voice" value={settings.voiceName} onChange={(e) => set({ voiceName: e.target.value })}>
          <option value="">Device default</option>
          {shown.map((v) => <option key={v.index} value={v.name}>{v.name} ({v.lang})</option>)}
        </select>
        {voice.voices.length === 0 && <p className="meta">No voice list available on this device.</p>}
      </div>

      <button className={`big-toggle ${settings.wearableAudio ? "on" : ""}`} role="switch"
              aria-checked={settings.wearableAudio} onClick={() => set({ wearableAudio: !settings.wearableAudio })}>
        <span>Wearable plays warnings (phone stays silent)</span>
        <strong>{settings.wearableAudio ? "ON" : "OFF"}</strong>
      </button>
      <p className="note">
        Turn this on once the wearable's own audio is connected, so warnings are not spoken twice.
      </p>

      <h2 className="section">Last spoken</h2>
      <p className="empty">
        {silent && "Phone voice is off. "}
        {voice.lastSpoken ? `“${voice.lastSpoken.text}” at ${new Date(voice.lastSpoken.at).toLocaleTimeString()}` : "Nothing spoken yet."}
      </p>
    </>
  );
}
