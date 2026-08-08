#!/usr/bin/env node
/** Configure the generated Capacitor Android app for a signed upgrade build. */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const gradlePath = path.join(root, "android", "app", "build.gradle");
const required = [
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
  "ANDROID_VERSION_CODE",
  "ANDROID_VERSION_NAME",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing Android release settings: ${missing.join(", ")}`);
  process.exit(1);
}
if (!fs.existsSync(gradlePath)) {
  console.error("Android app/build.gradle is missing. Run cap sync first.");
  process.exit(1);
}

const versionCode = Number.parseInt(process.env.ANDROID_VERSION_CODE, 10);
if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
  console.error("ANDROID_VERSION_CODE must be a positive integer.");
  process.exit(1);
}

let gradle = fs.readFileSync(gradlePath, "utf8");
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${process.env.ANDROID_VERSION_NAME}"`);

const signing = `
    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_FILE"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
`;

if (!gradle.includes("storeFile file(System.getenv(\"ANDROID_KEYSTORE_FILE\"))")) {
  gradle = gradle.replace(/\n\s*buildTypes\s*\{/, `${signing}\n    buildTypes {`);
}

const releaseBlock = /(release\s*\{)([\s\S]*?)(\n\s*\})/;
if (!releaseBlock.test(gradle)) {
  console.error("Could not locate the Android release build block.");
  process.exit(1);
}
gradle = gradle.replace(releaseBlock, (whole, open, body, close) =>
  body.includes("signingConfig signingConfigs.release")
    ? whole
    : `${open}\n            signingConfig signingConfigs.release${body}${close}`,
);

fs.writeFileSync(gradlePath, gradle, "utf8");
console.log(`✓ Android release configured as ${process.env.ANDROID_VERSION_NAME} (${versionCode})`);