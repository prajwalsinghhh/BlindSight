// Keeps unused models out of the APK (yolo11m.onnx alone is ~80 MB).
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const KEEP = new Set(["yolo11n.onnx", "pothole_yolo11n.onnx"]);
const dir = "dist/models";
if (existsSync(dir)) {
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".onnx") && !KEEP.has(f)) {
      rmSync(join(dir, f));
      console.log("pruned from build:", f);
    }
  }
}
