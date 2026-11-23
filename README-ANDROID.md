# Drishti – Android build guide

## Architecture (what is actually implemented)

| Part | How it works |
|---|---|
| YOLO | **Unchanged.** Runs **in the WebView** with `onnxruntime-web` (YOLO11n + pothole model). No Python server, no laptop needed. |
| Camera source | `Phone camera` (existing `getUserMedia`, for testing) **or** `ESP32-CAM` (MJPEG `<img>` URL). Chosen in Live Vision. |
| Detection loop | One shared loop (`src/engine/DetectionProvider.jsx`) feeds all four screens. No duplicate inference. |
| Sensors | `src/hardware/sensorClient.js`: WebSocket or HTTP-polling JSON. **Contract documented at the top of that file.** Empty until you enter an address. |
| Severity | CAUTION/WARNING/DANGER did not exist. Camera-only estimate in `src/engine/severity.js` (path position + apparent size). Firmware `alert` can only *raise* it. |
| Voice | Android native TTS (`@capacitor-community/text-to-speech`). "Wearable plays warnings" switch silences the phone to avoid double speech. |
| ToF distance | Shown **only** in Sensor Dashboard, never in Obstacle Detection. |

## One-time setup

```bash
npm install
npm install @capacitor/core @capacitor/app @capacitor/splash-screen @capacitor/android @capacitor-community/text-to-speech
npm install -D @capacitor/cli @capacitor/assets

npm pkg set scripts.predev="node scripts/copy-ort.mjs"
npm pkg set scripts.prebuild="node scripts/copy-ort.mjs"
npm pkg set scripts.build="vite build && node scripts/prune-dist.mjs"
npm pkg set scripts.android:sync="npm run build && npx cap sync android"

npx cap add android
node scripts/patch-android.mjs          # network policy, camera permission, portrait
npx capacitor-assets generate --android # icon + splash from /assets
```
Requires Node 20+, Android Studio and the JDK version the installed Capacitor asks for.

## Build & run

```bash
npm run android:sync
npx cap open android          # Android Studio -> Run on a USB-connected phone
# or a debug APK from the command line:
cd android && ./gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```
Desktop test of the UI: `npm run dev` (use the phone-camera source).

## Signed release (APK / AAB)

```bash
keytool -genkey -v -keystore drishti.jks -alias drishti -keyalg RSA -keysize 2048 -validity 10000
```
Android Studio -> **Build > Generate Signed App Bundle / APK** -> pick `drishti.jks`.
Or `cd android && ./gradlew bundleRelease` (AAB) / `assembleRelease` (APK) after adding a `signingConfig` to `android/app/build.gradle`.
Back up the keystore; never commit it.

## Connecting the hardware later

1. **Camera:** Live Vision -> ESP32-CAM -> enter the MJPEG URL (e.g. `http://192.168.4.1:81/stream`).
   The ESP32 must send `Access-Control-Allow-Origin: *` on the stream, otherwise the browser blocks reading pixels for YOLO (the app shows a CORS error message).
2. **Sensors:** Sensor Dashboard -> ESP32 card -> enter `ws://<ip>/ws` or `http://<ip>/status`, and make the firmware emit the JSON described in `sensorClient.js`. Fields you don't have yet simply show "Data unavailable".
3. **Cleartext:** add the ESP32's IP to `android-config/network_security_config.xml`, then re-run `node scripts/patch-android.mjs` and sync. Only listed hosts may use plain HTTP/WS.
4. **Audio:** once the wearable speaks, switch on "Wearable plays warnings".
5. **Remove the phone-camera option** and the `CAMERA` permission when it is no longer needed.

## Tuning
- Severity thresholds: `THRESHOLDS` in `src/engine/severity.js` (tune on real footage).
- Spoken phrases: `src/engine/messages.js`. "Vehicle approaching" is only said for a very large vehicle in the path (the app cannot measure motion).

## Test status – be honest
**Nothing here has been built or run yet** (the authoring environment had no network, Android SDK or hardware). Only JavaScript syntax of non-JSX modules was checked.

| Area | Status |
|---|---|
| `npm run build` / Gradle build / APK install | Not run |
| Phone camera + YOLO in Android WebView | Not run |
| ONNX offline WASM loading | Not run (watch for a wasm load error on first launch) |
| ESP32-CAM stream, CORS, stall/reconnect | Not run – no hardware |
| Sensor dashboard with real data | Not run – no hardware |
| Native TTS, voice settings | Not run |
| TalkBack pass | Not run |
