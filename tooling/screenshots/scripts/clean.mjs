#!/usr/bin/env node
/**
 * Remove generated PNG screenshots (keeps directory structure / .gitkeep).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const ROOT = path.join(REPO_ROOT, "screenshots");

function walkRemovePng(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkRemovePng(p);
    else if (name.endsWith(".png")) fs.unlinkSync(p);
  }
}

walkRemovePng(ROOT);
console.log("[screenshots] Removed .png files under screenshots/");
