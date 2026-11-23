import { isPothole, rank } from "./severity";

const VEHICLES = new Set(["car", "bus", "truck", "motorcycle", "bicycle", "train"]);

const where = (direction) =>
  direction === "LEFT" ? "on your left" : direction === "RIGHT" ? "on your right" : "ahead";

/** Phrase for one detection, e.g. "Person on your left." */
export function phraseFor(d) {
  const place = where(d.direction);
  let text;

  if (isPothole(d)) {
    text = `Pothole ${place}.`;
  } else if (d.className === "person") {
    text = `Person ${place}.`;
  } else if (VEHICLES.has(d.className)) {
    // We cannot measure motion, so "approaching" is only used when a vehicle
    // is in the path AND appears very large (DANGER). Otherwise: position only.
    text = d.severity === "DANGER" && d.pathStatus === "IN PATH"
      ? "Vehicle approaching."
      : `Vehicle ${place}.`;
  } else {
    text = `Obstacle ${place}.`;
  }
  return d.severity === "DANGER" ? `Danger. ${text}` : text;
}

/** Highest-priority spoken candidate at or above minLevel, or null. */
export function pickAnnouncement(analysis, minLevel) {
  if (!analysis.active) return null;
  const top = analysis.items.find((d) => rank(d.severity) >= rank(minLevel) && rank(d.severity) > 0);
  if (!top) return null;
  return { text: phraseFor(top), severity: top.severity };
}
