// Warning severity.
//
// The existing project had no CAUTION / WARNING / DANGER logic - only the
// path status (IN PATH / PARTIAL / OUTSIDE PATH) and LEFT / CENTER / RIGHT.
// Until the wearable supplies distance data, severity is ESTIMATED from the
// camera only: path position + how tall the object appears in the frame
// (a rough proximity proxy). Tune the numbers below on real footage.
//
// If the firmware later sends its own "alert" level, it is merged with
// max() in App.jsx instead of adding a second competing decision system.

export const LEVELS = ["CLEAR", "CAUTION", "WARNING", "DANGER"];
export const ZONES = ["LEFT", "CENTER", "RIGHT", "DOWNWARD"];

export const THRESHOLDS = {
  dangerHeightRatio: 0.6, // object covers >= 60% of frame height
  warningHeightRatio: 0.35,
};

export const rank = (level) => LEVELS.indexOf(level);
export const maxLevel = (a, b) => (rank(a) >= rank(b) ? a : b);
export const isValidLevel = (v) => LEVELS.includes(v);
export const isPothole = (d) => d.className?.toLowerCase().includes("pothole");

export function severityOf(d, frameHeight) {
  if (d.pathStatus === "OUTSIDE PATH") return "CLEAR";
  const inPath = d.pathStatus === "IN PATH";
  const heightRatio = (d.y2 - d.y1) / frameHeight;

  if (isPothole(d)) return inPath ? "WARNING" : "CAUTION";

  if (inPath) {
    if (heightRatio >= THRESHOLDS.dangerHeightRatio) return "DANGER";
    if (heightRatio >= THRESHOLDS.warningHeightRatio) return "WARNING";
    return "CAUTION";
  }
  // PARTIAL overlap with the walking corridor
  return heightRatio >= THRESHOLDS.dangerHeightRatio ? "WARNING" : "CAUTION";
}

export function emptyAnalysis(active) {
  const zones = {};
  ZONES.forEach((z) => (zones[z] = { level: "CLEAR", items: [] }));
  return { active, overall: active ? "CLEAR" : null, zones, items: [] };
}

/**
 * active = camera is live AND the model is loaded. When false, the result is
 * "scanning off" (overall = null) - never CLEAR, because CLEAR must mean
 * "we are looking and nothing is in the way".
 */
export function analyze(detections, frame, active) {
  const result = emptyAnalysis(active);
  if (!active || !frame.h) return result;

  const items = detections
    .map((d) => ({ ...d, severity: severityOf(d, frame.h) }))
    .sort(
      (a, b) =>
        rank(b.severity) - rank(a.severity) ||
        (b.y2 - b.y1) - (a.y2 - a.y1)
    );

  for (const item of items) {
    // DOWNWARD = ground hazards from the pothole model only. Nothing else is
    // classified as downward until the hardware supplies that information.
    const zone = isPothole(item) ? "DOWNWARD" : item.direction;
    result.zones[zone].items.push(item);
    result.zones[zone].level = maxLevel(result.zones[zone].level, item.severity);
    result.overall = maxLevel(result.overall, item.severity);
  }
  result.items = items;
  return result;
}
