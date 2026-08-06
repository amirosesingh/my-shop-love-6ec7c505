#!/usr/bin/env node
/**
 * Guarantees the generated Android project asks for the camera.
 *
 * `npx cap add android` writes a stock manifest that has no camera permission,
 * so barcode/QR scanning silently fails on a real phone. This runs after
 * `cap sync` and injects the permission plus the optional-hardware feature
 * flags (optional so the APK still installs on camera-less devices).
 */
const fs = require("node:fs");
const path = require("node:path");

const manifest = path.resolve(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "AndroidManifest.xml",
);

if (!fs.existsSync(manifest)) {
  console.log("· no Android project yet — nothing to patch");
  process.exit(0);
}

const lines = [
  '    <uses-permission android:name="android.permission.CAMERA" />',
  '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
  '    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />',
];

let xml = fs.readFileSync(manifest, "utf8");
const missing = lines.filter((l) => !xml.includes(l.trim().split(" ")[1]));
if (!missing.length) {
  console.log("✓ camera permission already present");
  process.exit(0);
}

xml = xml.replace("</manifest>", `${lines.join("\n")}\n</manifest>`);
fs.writeFileSync(manifest, xml, "utf8");
console.log("✓ camera permission added to AndroidManifest.xml");
