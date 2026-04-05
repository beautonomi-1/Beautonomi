#!/usr/bin/env node
/**
 * Run Maestro screenshot flows with deterministic output directories.
 * Uses vendored Maestro from tooling/screenshots/.tools when present (pnpm screenshots:setup).
 *
 * Usage (from repo root):
 *   node tooling/screenshots/scripts/capture.mjs customer public
 *   node tooling/screenshots/scripts/capture.mjs customer auth
 *   node tooling/screenshots/scripts/capture.mjs provider public
 *   node tooling/screenshots/scripts/capture.mjs provider auth
 *   node tooling/screenshots/scripts/capture.mjs all
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const MAESTRO_DIR = path.join(REPO_ROOT, "tooling", "screenshots", "maestro");

const FLOWS = {
  "customer.public": "customer.android.public.yaml",
  "customer.auth": "customer.android.authenticated.yaml",
  "provider.public": "provider.android.public.yaml",
  "provider.auth": "provider.android.authenticated.yaml",
};

function getBundledMaestroBin() {
  const name = process.platform === "win32" ? "maestro.bat" : "maestro";
  const p = path.join(REPO_ROOT, "tooling", "screenshots", ".tools", "maestro", "maestro", "bin", name);
  return fs.existsSync(p) ? p : null;
}

function resolveJavaHome() {
  const env = process.env.JAVA_HOME?.trim();
  if (env) {
    const java =
      process.platform === "win32"
        ? path.join(env, "bin", "java.exe")
        : path.join(env, "bin", "java");
    if (fs.existsSync(java)) return env;
  }
  if (process.platform === "win32") {
    const ms = "C:\\Program Files\\Microsoft";
    if (fs.existsSync(ms)) {
      for (const name of fs.readdirSync(ms)) {
        if (!name.startsWith("jdk-")) continue;
        const jh = path.join(ms, name);
        if (fs.existsSync(path.join(jh, "bin", "java.exe"))) return jh;
      }
    }
  }
  return null;
}

function maestroEnv() {
  const env = { ...process.env, MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true" };
  const jh = resolveJavaHome();
  if (jh) env.JAVA_HOME = jh;
  const sdk = resolveAndroidSdkRoot();
  if (sdk && !env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
    env.ANDROID_HOME = sdk;
  }
  return env;
}

function runMaestroSync(maestroArgs) {
  const env = maestroEnv();
  const bundled = getBundledMaestroBin();
  if (bundled) {
    return spawnSync(bundled, maestroArgs, {
      stdio: "inherit",
      cwd: REPO_ROOT,
      shell: process.platform === "win32",
      env,
    });
  }
  return spawnSync("maestro", maestroArgs, {
    stdio: "inherit",
    cwd: REPO_ROOT,
    shell: process.platform === "win32",
    env,
  });
}

function resolveAndroidSdkRoot() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv?.trim()) return fromEnv.trim();
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || "";
    const user = process.env.USERPROFILE || "";
    const candidates = [
      path.join(local, "Android", "Sdk"),
      path.join(user, "AppData", "Local", "Android", "Sdk"),
    ];
    for (const c of candidates) {
      const adb = path.join(c, "platform-tools", "adb.exe");
      if (fs.existsSync(adb)) return c;
    }
    const wingetPkgs = path.join(local, "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(wingetPkgs)) {
      try {
        for (const name of fs.readdirSync(wingetPkgs)) {
          if (!name.startsWith("Google.PlatformTools")) continue;
          const root = path.join(wingetPkgs, name);
          const adb = path.join(root, "platform-tools", "adb.exe");
          if (fs.existsSync(adb)) return root;
        }
      } catch {
        /* ignore */
      }
    }
  } else {
    const home = process.env.HOME || "";
    const candidates = [path.join(home, "Library", "Android", "sdk"), path.join(home, "Android", "Sdk")];
    for (const c of candidates) {
      const adb = path.join(c, "platform-tools", "adb");
      if (fs.existsSync(adb)) return c;
    }
  }
  return null;
}

function resolveAdb() {
  const home = resolveAndroidSdkRoot();
  if (home) {
    const name = process.platform === "win32" ? "adb.exe" : "adb";
    const p = path.join(home, "platform-tools", name);
    if (fs.existsSync(p)) return p;
  }
  if (process.platform === "win32") {
    const r = spawnSync("where.exe", ["adb"], { encoding: "utf8" });
    const line = r.stdout?.split(/\r?\n/).map((l) => l.trim()).find((l) => /adb\.exe$/i.test(l));
    if (line && fs.existsSync(line)) return line;
  } else {
    const r = spawnSync("which", ["adb"], { encoding: "utf8" });
    const p = r.stdout?.trim();
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function checkAndroidDevice() {
  const adb = resolveAdb();
  if (!adb) {
    console.warn(
      "[screenshots] ANDROID_HOME / ANDROID_SDK_ROOT not set or adb missing — install Android Studio + platform-tools, then start an emulator.",
    );
    return;
  }
  const r = spawnSync(adb, ["devices"], { encoding: "utf8" });
  const ready = r.stdout
    .split("\n")
    .some((line) => /\tdevice\s*$/.test(line) && !line.startsWith("List"));
  if (!ready) {
    console.warn('[screenshots] No device in "device" state — start an Android emulator (AVD) first.');
  }
}

function ensureMaestro() {
  const bundled = getBundledMaestroBin();
  const env = maestroEnv();
  if (!bundled && !resolveJavaHome()) {
    console.warn(
      "[screenshots] JDK 17+ not found. Maestro needs Java. Install: winget install Microsoft.OpenJDK.17",
    );
  }
  const r = bundled
    ? spawnSync(bundled, ["-v"], { encoding: "utf8", shell: process.platform === "win32", env })
    : spawnSync("maestro", ["-v"], { encoding: "utf8", shell: process.platform === "win32", env });
  if (r.status !== 0) {
    console.error(
      "[screenshots] Maestro CLI not working. Run: pnpm screenshots:setup\n" +
        "   Or install globally: https://docs.maestro.dev/getting-started/installing-maestro",
    );
    process.exit(1);
  }
}

function runFlow(flowKey, outDir) {
  const file = FLOWS[flowKey];
  if (!file) {
    console.error("Unknown flow key:", flowKey);
    process.exit(1);
  }
  const flowPath = path.join(MAESTRO_DIR, file);
  if (!fs.existsSync(flowPath)) {
    console.error("Missing flow file:", flowPath);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const args = ["test", flowPath, "--test-output-dir", outDir];
  const bundled = getBundledMaestroBin();
  console.log("[screenshots]", bundled ? bundled : "maestro", args.join(" "));
  const res = runMaestroSync(args);
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

function main() {
  const [, , app, mode] = process.argv;
  ensureMaestro();
  checkAndroidDevice();

  if (!app || app === "all") {
    runFlow("customer.auth", path.join(REPO_ROOT, "screenshots", "customer", "android"));
    runFlow("provider.auth", path.join(REPO_ROOT, "screenshots", "provider", "android"));
    console.log("[screenshots] Done (customer + provider authenticated flows).");
    return;
  }

  const m = (mode || "auth").toLowerCase();
  if (app === "customer") {
    if (m === "public") {
      runFlow("customer.public", path.join(REPO_ROOT, "screenshots", "customer", "android"));
    } else if (m === "auth" || m === "authenticated") {
      runFlow("customer.auth", path.join(REPO_ROOT, "screenshots", "customer", "android"));
    } else {
      console.error("Usage: ... customer public|auth");
      process.exit(1);
    }
    return;
  }

  if (app === "provider") {
    if (m === "public") {
      runFlow("provider.public", path.join(REPO_ROOT, "screenshots", "provider", "android"));
    } else if (m === "auth" || m === "authenticated") {
      runFlow("provider.auth", path.join(REPO_ROOT, "screenshots", "provider", "android"));
    } else {
      console.error("Usage: ... provider public|auth");
      process.exit(1);
    }
    return;
  }

  console.error("First arg: customer | provider | all, second: public | auth (default auth)");
  process.exit(1);
}

main();
