#!/usr/bin/env node
/**
 * Download Maestro CLI into tooling/screenshots/.tools (not committed).
 * Requires: network. JDK 17+ still required at runtime (winget install Microsoft.OpenJDK.17).
 *
 * Usage: node tooling/screenshots/scripts/setup-tools.mjs [--force]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const TOOLS = path.join(REPO_ROOT, "tooling", "screenshots", ".tools");
const VERSION = process.env.MAESTRO_CLI_VERSION || "cli-2.4.0";
const ZIP_URL = `https://github.com/mobile-dev-inc/maestro/releases/download/${VERSION}/maestro.zip`;
const ZIP_PATH = path.join(TOOLS, "maestro-cli.download.zip");
const UNPACK = path.join(TOOLS, "_unpack");
const TARGET = path.join(TOOLS, "maestro");

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { "User-Agent": "Beautonomi-screenshots-setup" } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const loc = res.headers.location;
          if (!loc) {
            reject(new Error("Redirect without location"));
            return;
          }
          download(loc, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

function extractWindows(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const ps = `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(destDir)} -Force`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "inherit" });
  return r.status === 0;
}

function extractUnix(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const r = spawnSync("unzip", ["-o", "-q", zipPath, "-d", destDir], { stdio: "inherit" });
  return r.status === 0;
}

async function main() {
  const force = process.argv.includes("--force");
  const bat = path.join(TARGET, "maestro", "bin", process.platform === "win32" ? "maestro.bat" : "maestro");
  if (!force && fs.existsSync(bat)) {
    console.log("[screenshots:setup] Maestro already present:", bat);
    console.log("[screenshots:setup] Use --force to re-download.");
    return;
  }

  fs.mkdirSync(TOOLS, { recursive: true });
  console.log("[screenshots:setup] Downloading", ZIP_URL);
  await download(ZIP_URL, ZIP_PATH);

  fs.rmSync(UNPACK, { recursive: true, force: true });
  const ok =
    process.platform === "win32" ? extractWindows(ZIP_PATH, UNPACK) : extractUnix(ZIP_PATH, UNPACK);
  if (!ok) {
    console.error("[screenshots:setup] Failed to extract zip.");
    process.exit(1);
  }

  const nested = path.join(UNPACK, "maestro");
  if (!fs.existsSync(path.join(nested, "maestro", "bin"))) {
    console.error("[screenshots:setup] Unexpected zip layout; expected unpack/maestro/maestro/bin");
    process.exit(1);
  }

  fs.rmSync(TARGET, { recursive: true, force: true });
  fs.renameSync(nested, TARGET);
  fs.rmSync(UNPACK, { recursive: true, force: true });
  fs.unlinkSync(ZIP_PATH);

  console.log("[screenshots:setup] Maestro installed to tooling/screenshots/.tools/maestro");
  console.log("[screenshots:setup] Install JDK 17+ if needed: winget install Microsoft.OpenJDK.17");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
