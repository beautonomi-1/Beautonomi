#!/usr/bin/env node
/**
 * Port-safe Expo dev launcher for monorepo.
 * Finds an available port and spawns Expo with --non-interactive --go --lan --web
 * so the app is available in the browser at http://localhost:<port> as well as in Expo Go.
 * No prompts. Works on Windows. Uses Node net module.
 *
 * Usage: node port-safe-expo-dev.js <preferredPort> <fallbackPort>
 * Example: node port-safe-expo-dev.js 8081 8083
 * (Run from repo root when using turbo so Metro resolves app entry.)
 */
const fs = require("fs");
const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

// #region agent log
const DEBUG_LOG_PATH = path.resolve(__dirname, "..", "..", "debug-0c7cf8.log");
function writeDebugLog(obj) {
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, JSON.stringify({ ...obj, sessionId: "0c7cf8", timestamp: Date.now() }) + "\n");
  } catch (_) {}
}
// #endregion

const args = process.argv.slice(2);
const clearCache = args.includes("clear");
const numericArgs = args.filter((a) => a !== "clear").map(Number);
const [preferredPort, fallbackPort] = numericArgs;
if (!preferredPort || !fallbackPort || isNaN(preferredPort) || isNaN(fallbackPort)) {
  console.error("Usage: node port-safe-expo-dev.js <preferredPort> <fallbackPort> [clear]");
  process.exit(1);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      resolve(err.code === "EADDRINUSE" ? false : false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function pickPort() {
  if (await isPortAvailable(preferredPort)) return preferredPort;
  if (await isPortAvailable(fallbackPort)) return fallbackPort;
  for (let p = fallbackPort + 1; p <= fallbackPort + 30; p++) {
    if (await isPortAvailable(p)) return p;
  }
  console.error(`No available port in range ${preferredPort}-${fallbackPort + 30}.`);
  process.exit(1);
}

function getAppName() {
  const cwd = process.cwd();
  const base = path.basename(cwd);
  return base === "customer" || base === "provider" ? base : "expo";
}

async function main() {
  let port = await pickPort();
  // Re-verify preferred port is still free (avoids race when another process grabbed it)
  if (port === preferredPort && !(await isPortAvailable(preferredPort))) {
    port = await pickPort();
  }
  const appName = getAppName();
  console.log(`✅ ${appName} using Expo port: ${port}`);

  const portArg = "--port " + String(port);
  const cacheArg = clearCache ? "-c " : "";
  const cmd = "npx expo start " + cacheArg + portArg + " --non-interactive --go --lan --web";
  let stderrText = "";
  const proc = spawn(cmd, {
    stdio: ["inherit", "inherit", "pipe"],
    shell: true,
    cwd: process.cwd(),
    env: {
      ...process.env,
      EXPO_NO_TELEMETRY: "1",
      CI: "1",
    },
  });

  proc.stderr.on("data", (chunk) => {
    const text = (chunk && chunk.toString) ? chunk.toString() : String(chunk);
    stderrText += text;
    process.stderr.write(chunk);
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    for (const line of lines) {
      writeDebugLog({ location: "port-safe-expo-dev.js:metro_stderr", message: "metro_stderr", data: { line }, hypothesisId: "A" });
    }
  });
  proc.stderr.on("error", (err) => {
    writeDebugLog({ location: "port-safe-expo-dev.js:stderr_error", message: "stderr_error", data: { err: String(err) }, hypothesisId: "A" });
  });

  proc.on("exit", (code) => {
    const portInUse = /port\s+\d+\s+is\s+being\s+used|EADDRINUSE/i.test(stderrText);
    if (code !== 0 && portInUse && port === preferredPort) {
      console.error("Port", port, "was in use; retrying with next available port...");
      runWithNextPort();
      return;
    }
    process.exit(code ?? 0);
  });
}

async function runWithNextPort() {
  const port = await pickPort();
  const appName = getAppName();
  console.log("✅", appName, "using Expo port:", port);
  const cacheArg = clearCache ? "-c " : "";
  const cmd = "npx expo start " + cacheArg + "--port " + String(port) + " --non-interactive --go --lan --web";
  const proc = spawn(cmd, {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
    env: { ...process.env, EXPO_NO_TELEMETRY: "1", CI: "1" },
  });
  proc.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
