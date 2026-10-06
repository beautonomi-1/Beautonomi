#!/usr/bin/env node
/**
 * Runs expo-doctor in customer + provider. Prunes workspace peer copies first
 * (see tooling/pnpm/prune-workspace-expo-peer-node-modules.mjs).
 *
 * pnpm keeps multiple install paths for the same semver (e.g. expo under
 * @expo/dom-webview vs app root). expo-doctor flags that as duplicates even
 * when versions match. We fail only if doctor reports other checks or mixed
 * versions in the duplicate list.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const apps = ["customer", "provider"];

execSync("node tooling/pnpm/prune-workspace-expo-peer-node-modules.mjs", {
  cwd: root,
  stdio: "inherit",
});

/** @param {string} output */
function duplicateCheckIsSameVersionOnly(output) {
  if (!output.includes("Check that no duplicate dependencies are installed")) {
    return false;
  }
  const dupSection = output.split("Found duplicates for")[1];
  if (!dupSection) return false;

  const versionLines = [...dupSection.matchAll(/((?:@[\w-]+\/)?[\w-]+)@([\d.]+)/g)];
  if (versionLines.length === 0) return false;

  const byPkg = new Map();
  for (const m of versionLines) {
    const pkg = m[1];
    const ver = m[2];
    if (!byPkg.has(pkg)) byPkg.set(pkg, new Set());
    byPkg.get(pkg).add(ver);
  }
  for (const versions of byPkg.values()) {
    if (versions.size > 1) return false;
  }
  return true;
}

/** @param {string} output */
function analyzeDoctorOutput(output) {
  const passedMatch = output.match(/(\d+)\/(\d+) checks passed/);
  const total = passedMatch ? Number(passedMatch[2]) : 21;
  const passed = passedMatch ? Number(passedMatch[1]) : 0;
  const failedCount = total - passed;

  if (failedCount === 0) {
    return { ok: true, evidence: `${passed}/${total} checks passed.` };
  }

  const sdkVersionFalseFail =
    /Check that packages match versions required by installed Expo SDK/i.test(output) &&
    /"upToDate"\s*:\s*true/i.test(output) &&
    /"dependencies"\s*:\s*\[\]/i.test(output);

  if (sdkVersionFalseFail && failedCount === 1) {
    return {
      ok: true,
      evidence: `${passed}/${total} checks passed; SDK version check reported upToDate with no mismatches (EAS/expo-iap noise).`,
    };
  }

  const otherFailures = [...output.matchAll(/✖ Check ([^\n]+)/g)]
    .map((m) => m[1].trim())
    .filter((name) => !/duplicate dependencies are installed/i.test(name));

  if (otherFailures.length > 0) {
    return {
      ok: false,
      evidence: `Failed checks: ${otherFailures.join("; ")}`,
    };
  }

  if (duplicateCheckIsSameVersionOnly(output)) {
    return {
      ok: true,
      evidence: `${passed}/${total} checks passed; duplicate-path warning only (same semver, pnpm monorepo).`,
    };
  }

  return {
    ok: false,
    evidence: "Duplicate dependencies with conflicting versions or unparsed duplicate output.",
  };
}

let failed = false;
for (const app of apps) {
  const cwd = path.join(root, "apps", app);
  console.log(`\n== expo-doctor (${app}) ==\n`);
  let output = "";
  try {
    output = execSync("npx expo-doctor", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    process.stdout.write(output);
  } catch (e) {
    const err = /** @type {{ stdout?: string; stderr?: string }} */ (e);
    output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    process.stdout.write(output);
  }

  const result = analyzeDoctorOutput(output);
  if (result.ok) {
    console.log(`\n[audit:expo-doctor] ${app}: OK — ${result.evidence}\n`);
  } else {
    console.error(`\n[audit:expo-doctor] ${app}: FAIL — ${result.evidence}\n`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
