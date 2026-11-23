
import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";

import { DetectionProvider, useDetection } from "./engine/DetectionProvider";
import { useStoredState } from "./engine/storage";
import { DEFAULT_VOICE_SETTINGS, useVoice } from "./voice/useVoice";
import { Icons } from "./components/ui";

import LiveVision from "./screens/LiveVision";
import Obstacles from "./screens/Obstacles";
import Voice from "./screens/Voice";

const TABS = [
  { id: "live", label: "Live Vision", icon: Icons.live },
  { id: "obstacles", label: "Obstacles", icon: Icons.obstacle },
  { id: "voice", label: "Voice", icon: Icons.voice },
];

const DEFAULT_CAMERA = { mode: "phone", url: "" };

function Shell({ camera, setCamera }) {
  const { analysis } = useDetection();

  const [voiceSettings, setVoiceSettings] = useStoredState(
    "drishti.voice",
    DEFAULT_VOICE_SETTINGS
  );

  const [tab, setTab] = useState("live");
  const overall = analysis.overall;

  const voice = useVoice(analysis, voiceSettings);

  // Android back button
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    let handle;

    CapApp.addListener("backButton", () => {
      if (tabRef.current !== "live") {
        setTab("live");
      } else {
        CapApp.minimizeApp();
      }
    }).then((h) => (handle = h)).catch(() => {});

    return () => handle?.remove();
  }, []);

  // Move focus to the new screen's title
  const headings = {
    live: useRef(null),
    obstacles: useRef(null),
    voice: useRef(null),
  };

  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }

    headings[tab].current?.focus();
  }, [tab]);

  const onKey = useCallback((e) => {
    const i = TABS.findIndex((t) => t.id === tab);

    if (e.key === "ArrowRight") {
      setTab(TABS[(i + 1) % TABS.length].id);
    }

    if (e.key === "ArrowLeft") {
      setTab(TABS[(i + TABS.length - 1) % TABS.length].id);
    }
  }, [tab]);

  return (
    <div className="app">
      <main className="screens">
        <div
          className="screen"
          hidden={tab !== "live"}
          role="tabpanel"
          id="p-live"
          aria-labelledby="t-live"
        >
          <LiveVision
            source={camera}
            setSource={setCamera}
            headingRef={headings.live}
          />
        </div>

        <div
          className="screen"
          hidden={tab !== "obstacles"}
          role="tabpanel"
          id="p-obstacles"
          aria-labelledby="t-obstacles"
        >
          <Obstacles
            analysis={analysis}
            overall={overall}
            voiceOn={voiceSettings.enabled}
            headingRef={headings.obstacles}
          />
        </div>

        <div
          className="screen"
          hidden={tab !== "voice"}
          role="tabpanel"
          id="p-voice"
          aria-labelledby="t-voice"
        >
          <Voice
            settings={voiceSettings}
            setSettings={setVoiceSettings}
            voice={voice}
            headingRef={headings.voice}
          />
        </div>
      </main>

      <nav
        className="tabs"
        role="tablist"
        aria-label="Drishti sections"
        onKeyDown={onKey}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`t-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`p-${t.id}`}
            className={tab === t.id ? "on" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const [camera, setCamera] = useStoredState(
    "drishti.camera",
    DEFAULT_CAMERA
  );

  return (
    <DetectionProvider source={camera}>
      <Shell camera={camera} setCamera={setCamera} />
    </DetectionProvider>
  );
}
