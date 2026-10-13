import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ciPath = path.join(root, "_maps/t-sa-mobile-ci-leftover.json");
const ci = JSON.parse(fs.readFileSync(ciPath, "utf8"));

const PHRASES = [
  "Shipping weight (g)",
  "This address is outside your service area.",
  "Could not validate this address. Check your connection and try again.",
  "Original audio",
  "Viewers hear this music instead of your clip's audio on Explore.",
  "No catalog tracks yet — use original audio or ask your admin to add platform sounds.",
  "Courier",
  "Connect API keys in the provider web app under Ecommerce → Shipping.",
  "Collect on {{name}} ({{provider}})",
  "Switch machine",
  "Book courier",
  "Print label",
  "Courier booking",
  "Retry booking",
  "Background sound (optional)",
  "Add music (optional)",
  "Popular sounds",
  "Video exceeds the maximum length for Explore ({{seconds}} seconds).",
  "Trim video",
  "Drag to choose which part of your video appears on Explore.",
  "{{seconds}}s clip",
  "Choose clip start",
  "Use clip",
  "Finish trimming your video before continuing.",
  "Hold to record",
  "Release to finish",
  "Tap for photo",
  "Selected clip",
  "Flip camera",
  "Front camera",
  "Switch to front camera",
  "Opening camera…",
];

const LOCALES = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "fr", "ar"];

async function google(text, tl) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
    encodeURIComponent(tl) +
    "&dt=t&q=" +
    encodeURIComponent(text);
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) return null;
  const data = JSON.parse(await res.text());
  return data[0].map((x) => x[0]).join("");
}

function lockVars(s) {
  const locks = [];
  return {
    out: s.replace(/\{\{(\w+)\}\}/g, (m) => {
      locks.push(m);
      return `\uE000${locks.length - 1}\uE001`;
    }),
    locks,
  };
}

function unlockVars(s, locks) {
  return s.replace(/\uE000(\d+)\uE001/g, (_, i) => locks[Number(i)]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const phrase of PHRASES) {
  if (ci[phrase]?.af && ci[phrase].af !== phrase) continue;
  const row = { ...(ci[phrase] ?? {}) };
  for (const locale of LOCALES) {
    if (row[locale] && row[locale] !== phrase) continue;
    const { out, locks } = lockVars(phrase);
    const tr = await google(out, locale);
    if (!tr) continue;
    row[locale] = unlockVars(tr, locks);
    await sleep(100);
  }
  if (Object.keys(row).length) ci[phrase] = row;
  console.log("phrase", phrase.slice(0, 50), "locales", Object.keys(row).length);
}

fs.writeFileSync(ciPath, JSON.stringify(ci, null, 2) + "\n");
console.log("wrote ci-leftover", Object.keys(ci).length, "entries");

spawnSync(process.execPath, ["scripts/leftover-tr-mobile-apps.mjs", "--apply"], {
  cwd: root,
  stdio: "inherit",
});
