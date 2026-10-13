/**
 * Batch-translate _new-keys.json into every full locale (overlays fall back to their base).
 * Usage: node _translate-new-keys.mjs [locale ...]   (default: all full locales)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lockTokens, unlock } from "../scripts/_mymemory-translate.mjs";
import { safeWriteJson } from "../scripts/_safe-write-json.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "../src/locales");
const OVERLAYS = new Set(["en", "en-GB", "en-US", "en-AU", "pt-BR", "es-MX"]);
const EXTRA_BRANDS = ["PayCloud"];
const newKeys = JSON.parse(fs.readFileSync(path.join(here, "_new-keys.json"), "utf8"));
const entries = Object.entries(newKeys);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lockAll(text) {
  const { out, locks } = lockTokens(text);
  let s = out;
  for (const b of EXTRA_BRANDS) {
    if (s.includes(b)) {
      locks.push(b);
      s = s.split(b).join(`\uE000${locks.length - 1}\uE001`);
    }
  }
  return { out: s, locks };
}

async function google(text, tl) {
  for (let i = 0; i < 4; i++) {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
      encodeURIComponent(tl) +
      "&dt=t&q=" +
      encodeURIComponent(text);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (res.status === 429) {
        await sleep(4000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = JSON.parse(await res.text());
      return data[0].map((x) => x[0]).join("");
    } catch {
      await sleep(800 * (i + 1));
    }
  }
  return null;
}

function setDeep(obj, key, value) {
  const parts = key.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

const restoredOk = (src, out) => {
  const vars = [...src.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[0]);
  return out && !/[\uE000\uE001]/.test(out) && vars.every((v) => out.includes(v));
};

const missingOnly = process.argv.includes("--missing-only");
const requested = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const getDeep = (obj, key) =>
  key.split(".").reduce((a, p) => (a && typeof a === "object" ? a[p] : undefined), obj);

if (missingOnly) {
  for (const code of requested) {
    const file = path.join(dir, `${code}.json`);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    const todo = entries.filter(([k]) => getDeep(json, k) === undefined);
    const failed = [];
    for (const [k, v] of todo) {
      const { out } = lockAll(v);
      if (!/[A-Za-z]/.test(out.replace(/\uE000\d+\uE001/g, ""))) {
        setDeep(json, k, v);
        continue;
      }
      const raw = await google(v, code);
      const tr = raw?.trim();
      if (restoredOk(v, tr)) setDeep(json, k, tr);
      else failed.push(k);
      await sleep(300);
    }
    safeWriteJson(file, json);
    console.log(`${code}: filled ${todo.length - failed.length}/${todo.length}${failed.length ? ` FAILED: ${failed.join(", ")}` : ""}`);
  }
  process.exit(0);
}
const locales = (requested.length
  ? requested
  : fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
).filter((c) => !OVERLAYS.has(c));

for (const code of locales) {
  const tl = code === "nso" ? "nso" : code;
  const locked = entries.map(([, v]) => lockAll(v));
  const batch = locked.map((l) => l.out).join("\n");
  const raw = await google(batch, tl);
  let lines = raw ? raw.split("\n") : [];
  const results = new Array(entries.length).fill(null);
  if (lines.length === entries.length) {
    lines.forEach((line, i) => {
      const out = unlock(line.trim(), locked[i].locks);
      if (restoredOk(entries[i][1], out)) results[i] = out;
    });
  }
  for (let i = 0; i < entries.length; i++) {
    if (results[i]) continue;
    const single = await google(locked[i].out, tl);
    const out = single ? unlock(single.trim(), locked[i].locks) : null;
    results[i] = restoredOk(entries[i][1], out) ? out : null;
    await sleep(250);
  }
  const file = path.join(dir, `${code}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  let written = 0;
  const failed = [];
  entries.forEach(([k], i) => {
    if (results[i]) {
      setDeep(json, k, results[i]);
      written++;
    } else failed.push(k);
  });
  safeWriteJson(file, json);
  console.log(`${code}: wrote ${written}/${entries.length}${lines.length === entries.length ? "" : ` (batch lines ${lines.length})`}${failed.length ? ` FAILED: ${failed.join(", ")}` : ""}`);
  await sleep(1200);
}
