// Copies the ONNX Runtime WASM runtime into public/ort so the app works fully
// offline (phone connected to the wearable's Wi-Fi, no internet).
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const src = "node_modules/onnxruntime-web/dist";
const dst = "public/ort";
if (!existsSync(src)) {
  console.error("onnxruntime-web is not installed. Run: npm install");
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
let total = 0;
for (const f of readdirSync(src)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) {
    cpSync(join(src, f), join(dst, f));
    total += statSync(join(src, f)).size;
    console.log("copied", f);
  }
}
console.log(`ORT runtime files: ${(total / 1e6).toFixed(1)} MB -> ${dst}`);
