import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";

import { DetectionProvider, useDetection } from "./engine/DetectionProvider";
import { maxLevel } from "./engine/severity";
import { useStoredState } from "./engine/storage";
import { useSensors } from "./hardware/sensorClient";
import { DEFAULT_VOICE_SETTINGS, useVoice } from "./voice/useVoice";
import { Icons } from "./components/ui";
import LiveVision from "./screens/LiveVision";
import Obstacles from "./screens/Obstacles";
import Sensors from "./screens/Sensors";
import Voice from "./screens/Voice";

const TABS = [
  { id: "live", label: "Live Vision", icon: Icons.live },
  { id: "obstacles", label: "Obstacles", icon: Icons.obstacle },
  { id: "sensors", label: "Sensors", icon: Icons.sensors },
  { id: "voice", label: "Voice", icon: Icons.voice },
];

// Endpoints are empty until the hardware exists. Set them in the app (or here).
const DEFAULT_CAMERA = { mode: "phone", url: "" }; // "phone" = testing source
const DEFAULT_SENSOR = { url: "" };

function Shell({ camera, setCamera, sensorEndpoint, setSensorEndpoint }) {
  const { analysis } = useDetection();
  const sensors = useSensors(sensorEndpoint.url);
  const [voiceSettings, setVoiceSettings] = useStoredState("drishti.voice", DEFAULT_VOICE_SETTINGS);
  const [tab, setTab] = useState("live");

  // Merge: the wearable's own alert (if it sends one) can only RAISE the level,
  // so there is a single decision, not two competing systems.
  const { overall, overallSource } = useMemo(() => {
    const device = sensors.link === "connected" ? sensors.data?.alert : null;
    if (!analysis.active || !device) return { overall: analysis.overall, overallSource: "camera" };
    const merged = maxLevel(analysis.overall, device);
    return { overall: merged, overallSource: merged === analysis.overall ? "camera" : "device" };
  }, [analysis, sensors.link, sensors.data]);

  const voice = useVoice(analysis, voiceSettings);

  // Android back button: go to Live Vision first, then minimise (never kills the app).
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    let handle;
    CapApp.addListener("backButton", () => {
      if (tabRef.current !== "live") setTab("live");
      else CapApp.minimizeApp();
    }).then((h) => (handle = h)).catch(() => {});
    return () => handle?.remove();
  }, []);

  // Move focus to the new screen's title so TalkBack reads it.
  const headings = { live: useRef(null), obstacles: useRef(null), sensors: useRef(null), voice: useRef(null) };
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    headings[tab].current?.focus();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = useCallback((e) => {
    const i = TABS.findIndex((t) => t.id === tab);
    if (e.key === "ArrowRight") setTab(TABS[(i + 1) % TABS.length].id);
    if (e.key === "ArrowLeft") setTab(TABS[(i + TABS.length - 1) % TABS.length].id);
  }, [tab]);

  // All screens stay mounted (hidden) so there is exactly one camera + one
  // inference loop, and state survives tab changes.
  return (
    <div className="app">
      <main className="screens">
        <div className="screen" hidden={tab !== "live"} role="tabpanel" id="p-live" aria-labelledby="t-live">
          <LiveVision source={camera} setSource={setCamera} headingRef={headings.live} />
        </div>
        <div className="screen" hidden={tab !== "obstacles"} role="tabpanel" id="p-obstacles" aria-labelledby="t-obstacles">
          <Obstacles analysis={analysis} overall={overall} overallSource={overallSource}
                     voiceOn={voiceSettings.enabled && !voiceSettings.wearableAudio} headingRef={headings.obstacles} />
        </div>
        <div className="screen" hidden={tab !== "sensors"} role="tabpanel" id="p-sensors" aria-labelledby="t-sensors">
          <Sensors sensors={sensors} endpoint={sensorEndpoint} setEndpoint={setSensorEndpoint} headingRef={headings.sensors} />
        </div>
        <div className="screen" hidden={tab !== "voice"} role="tabpanel" id="p-voice" aria-labelledby="t-voice">
          <Voice settings={voiceSettings} setSettings={setVoiceSettings} voice={voice} headingRef={headings.voice} />
        </div>
      </main>

      <nav className="tabs" role="tablist" aria-label="Drishti sections" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button key={t.id} id={`t-${t.id}`} role="tab" aria-selected={tab === t.id}
                  aria-controls={`p-${t.id}`} className={tab === t.id ? "on" : ""}
                  onClick={() => setTab(t.id)}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const [camera, setCamera] = useStoredState("drishti.camera", DEFAULT_CAMERA);
  const [sensorEndpoint, setSensorEndpoint] = useStoredState("drishti.sensors", DEFAULT_SENSOR);
  return (
    <DetectionProvider source={camera}>
      <Shell camera={camera} setCamera={setCamera}
             sensorEndpoint={sensorEndpoint} setSensorEndpoint={setSensorEndpoint} />
    </DetectionProvider>
  );
}
