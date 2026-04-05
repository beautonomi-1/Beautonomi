#!/usr/bin/env node
/**
 * Preflight for screenshot capture: JDK, Maestro, adb, connected devices.
 * Run: pnpm screenshots:doctor
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function resolveJavaHome() {
  const env = process.env.JAVA_HOME?.trim();
  if (env) {
    const java = path.join(env, "bin", process.platform === "win32" ? "java.exe" : "java");
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

function resolveAndroidSdkRoot() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv?.trim()) return fromEnv.trim();
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || "";
    const candidates = [
      path.join(local, "Android", "Sdk"),
      path.join(process.env.USERPROFILE || "", "AppData", "Local", "Android", "Sdk"),
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
  }
  return null;
}

function resolveAdb() {
  const home = resolveAndroidSdkRoot();
  if (home) {
    const p = path.join(home, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
    if (fs.existsSync(p)) return p;
  }
  if (process.platform === "win32") {
    const r = spawnSync("where.exe", ["adb"], { encoding: "utf8" });
    const line = r.stdout?.split(/\r?\n/).map((l) => l.trim()).find((l) => /adb\.exe$/i.test(l));
    if (line && fs.existsSync(line)) return line;
  }
  return null;
}

function bundledMaestro() {
  const name = process.platform === "win32" ? "maestro.bat" : "maestro";
  const p = path.join(REPO_ROOT, "tooling", "screenshots", ".tools", "maestro", "maestro", "bin", name);
  return fs.existsSync(p) ? p : null;
}

console.log("=== Beautonomi screenshot doctor ===\n");

const jh = resolveJavaHome();
console.log(jh ? `JDK: OK (${jh})` : "JDK: MISSING — winget install Microsoft.OpenJDK.17");

const m = bundledMaestro();
console.log(
  m
    ? `Maestro (bundled): OK (${m})`
    : "Maestro (bundled): MISSING — pnpm screenshots:setup",
);

const sdk = resolveAndroidSdkRoot();
console.log(sdk ? `ANDROID_HOME (detected): ${sdk}` : "ANDROID_HOME: not detected (platform-tools only via PATH is OK)");

const adb = resolveAdb();
if (!adb) {
  console.log("adb: MISSING — winget install Google.PlatformTools");
} else {
  console.log(`adb: OK (${adb})`);
  const r = spawnSync(adb, ["devices"], { encoding: "utf8" });
  console.log("\nadb devices:\n" + (r.stdout || r.stderr || "(no output)"));
  const lines = (r.stdout || "").split("\n").filter((l) => /\tdevice\s*$/.test(l));
  if (lines.length === 0) {
    console.log(
      "\nNo device in 'device' state. Next steps:\n" +
        "  • Plug in an Android phone with USB debugging enabled, or\n" +
        "  • Install Android Studio, create an AVD (Device Manager), start the emulator.",
    );
  } else {
    console.log(`\nReady: ${lines.length} device(s) connected. Run pnpm screenshots:android:customer:public (signed out) or :auth (signed in).`);
  }
}

console.log("");
