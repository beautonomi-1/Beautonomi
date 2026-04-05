#!/usr/bin/env node
/**
 * Default production build entry: webpack locally (stable with pdfkit / server routes),
 * Turbopack on GitHub Actions only to cut peak RSS on ~7GB runners.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");

// Override: NEXT_WEB_FORCE_WEBPACK=1 on GHA if a webpack-only regression appears.
const useTurbopack =
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.NEXT_WEB_FORCE_WEBPACK !== "1";
const modeArgs = useTurbopack ? ["--turbopack"] : ["--webpack"];
const nodeOpts =
  process.env.NODE_OPTIONS || "--max-old-space-size=6144";

const result = spawnSync(process.execPath, [nextCli, "build", ...modeArgs], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: nodeOpts },
});

process.exit(result.status ?? 1);
