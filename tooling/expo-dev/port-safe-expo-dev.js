#!/usr/bin/env node
/**
 * Port-safe Expo dev launcher for monorepo.
 * Finds an available port and spawns Expo with --non-interactive --go --lan.
 * No prompts. Works on Windows. Uses Node net module.
 *
 * Usage: node port-safe-expo-dev.js <preferredPort> <fallbackPort>
 * Example: node port-safe-expo-dev.js 8081 8083
 */
const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

const [preferredPort, fallbackPort] = process.argv.slice(2).map(Number);
if (!preferredPort || !fallbackPort || isNaN(preferredPort) || isNaN(fallbackPort)) {
  console.error("Usage: node port-safe-expo-dev.js <preferredPort> <fallbackPort>");
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

  const proc = spawn(
    "npx",
    ["expo", "start", "--port", String(port), "--non-interactive", "--go", "--lan"],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: process.cwd(),
      env: {
        ...process.env,
        EXPO_NO_TELEMETRY: "1",
        CI: "1",
      },
    }
  );

  proc.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
