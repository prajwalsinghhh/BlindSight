// Run once after `npx cap add android`. Idempotent.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const manifestPath = "android/app/src/main/AndroidManifest.xml";
if (!existsSync(manifestPath)) {
  console.error("Run `npx cap add android` first.");
  process.exit(1);
}

mkdirSync("android/app/src/main/res/xml", { recursive: true });
copyFileSync("android-config/network_security_config.xml",
             "android/app/src/main/res/xml/network_security_config.xml");

let m = readFileSync(manifestPath, "utf8");

if (!m.includes("networkSecurityConfig")) {
  m = m.replace("<application", '<application\n        android:networkSecurityConfig="@xml/network_security_config"');
}
if (!m.includes("android.permission.CAMERA")) {
  // Needed ONLY for the phone-camera testing source. Remove these two lines
  // (and the "Phone camera" option) once the ESP32-CAM is the only source.
  m = m.replace("</manifest>",
    '    <uses-permission android:name="android.permission.CAMERA" />\n' +
    '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>');
}
if (!m.includes("android:screenOrientation")) {
  m = m.replace("<activity", '<activity\n            android:screenOrientation="portrait"');
}
writeFileSync(manifestPath, m);
console.log("Android manifest patched (network security config, camera, portrait).");
