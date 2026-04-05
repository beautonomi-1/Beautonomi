#!/usr/bin/env node
/**
 * Import ZA postal areas from GeoNames into Supabase.
 *
 * Flow:
 *  1) Download ZA.zip from GeoNames (or use --zip-path)
 *  2) Parse ZA.txt (tab-delimited)
 *  3) Normalize and stage rows into postal_areas_import_stage
 *  4) Call rebuild_postal_areas_from_stage() to materialize postal_areas
 *
 * Usage:
 *   node scripts/import-za-postal-areas.mjs
 *   node scripts/import-za-postal-areas.mjs --radius=900
 *   node scripts/import-za-postal-areas.mjs --zip-path=C:\tmp\ZA.zip
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_URL = "https://download.geonames.org/export/zip/ZA.zip";
const DEFAULT_COUNTRY = "ZA";
const DEFAULT_RADIUS_M = 900;
const STAGE_BATCH_SIZE = 1000;

function parseArgs(argv) {
  const args = {
    country: DEFAULT_COUNTRY,
    radius: DEFAULT_RADIUS_M,
    zipUrl: DEFAULT_URL,
    zipPath: "",
    keepStage: false,
  };
  for (const raw of argv) {
    const s = raw.trim();
    if (s === "--keep-stage") args.keepStage = true;
    else if (s.startsWith("--country=")) args.country = s.split("=")[1] || DEFAULT_COUNTRY;
    else if (s.startsWith("--radius=")) args.radius = Number(s.split("=")[1] || DEFAULT_RADIUS_M);
    else if (s.startsWith("--zip-url=")) args.zipUrl = s.split("=")[1] || DEFAULT_URL;
    else if (s.startsWith("--zip-path=")) args.zipPath = s.split("=")[1] || "";
  }
  return args;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function loadEnv() {
  const rootEnv = parseEnvFile(path.join(repoRoot, ".env.local"));
  const webEnv = parseEnvFile(path.join(repoRoot, "apps", "web", ".env.local"));
  const merged = { ...rootEnv, ...webEnv, ...process.env };
  return {
    supabaseUrl: merged.NEXT_PUBLIC_SUPABASE_URL || "",
    serviceRoleKey: merged.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

async function downloadToFile(url, outFile) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  const arr = await res.arrayBuffer();
  fs.writeFileSync(outFile, Buffer.from(arr));
}

function normalizeLabel(v) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
}

function parseGeoNamesZaText(content, countryCode) {
  const cc = countryCode.toUpperCase();
  const rows = [];
  const seen = new Set();
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line || !line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 11) continue;

    const country = normalizeLabel(cols[0])?.toUpperCase();
    if (country !== cc) continue;

    const postalCode = normalizeLabel(cols[1]);
    const placeName = normalizeLabel(cols[2]);
    const admin1 = normalizeLabel(cols[3]); // province-ish
    const admin2 = normalizeLabel(cols[5]); // district/city-ish
    const lat = Number(cols[9]);
    const lng = Number(cols[10]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

    // Practical mapping for Market Coverage search dimensions:
    // province_name <= admin1, city_name <= admin2 (fallback place), town_name <= place_name
    const province = admin1;
    const city = admin2 || placeName;
    const town = placeName;

    const key = [country, postalCode ?? "", province ?? "", city ?? "", town ?? "", lat.toFixed(6), lng.toFixed(6)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      country_code: country,
      province_name: province,
      city_name: city,
      town_name: town,
      postal_code: postalCode,
      latitude: lat,
      longitude: lng,
      source: "geonames",
    });
  }

  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const country = args.country.toUpperCase();
  if (!country || country.length !== 2) throw new Error(`Invalid --country: ${args.country}`);
  if (!Number.isFinite(args.radius) || args.radius < 50 || args.radius > 5000) {
    throw new Error(`Invalid --radius (allowed 50..5000): ${args.radius}`);
  }

  const { supabaseUrl, serviceRoleKey } = loadEnv();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env vars. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local or apps/web/.env.local"
    );
  }

  const workDir = path.join(repoRoot, ".tmp", "postal-import");
  fs.mkdirSync(workDir, { recursive: true });
  const zipPath = args.zipPath || path.join(workDir, `${country}.zip`);
  if (!args.zipPath) {
    console.log(`[1/5] Downloading ${args.zipUrl} ...`);
    await downloadToFile(args.zipUrl, zipPath);
  } else {
    console.log(`[1/5] Using local zip: ${zipPath}`);
    if (!fs.existsSync(zipPath)) throw new Error(`--zip-path not found: ${zipPath}`);
  }

  console.log("[2/5] Extracting and parsing GeoNames rows ...");
  const zip = new AdmZip(zipPath);
  const txtEntry = zip.getEntries().find((e) => e.entryName.toUpperCase() === `${country}.TXT`) ||
    zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".txt"));
  if (!txtEntry) throw new Error(`No .txt entry found in ${zipPath}`);
  const txt = zip.readAsText(txtEntry, "utf8");
  const parsedRows = parseGeoNamesZaText(txt, country);
  if (parsedRows.length === 0) {
    throw new Error(`No valid rows parsed for ${country}. Check source file format.`);
  }
  console.log(`Parsed ${parsedRows.length.toLocaleString()} staged rows for ${country}.`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("[3/5] Clearing previous staging rows ...");
  const clearRes = await supabase
    .from("postal_areas_import_stage")
    .delete()
    .eq("country_code", country);
  if (clearRes.error) throw clearRes.error;

  console.log("[4/5] Uploading stage rows in batches ...");
  for (let i = 0; i < parsedRows.length; i += STAGE_BATCH_SIZE) {
    const batch = parsedRows.slice(i, i + STAGE_BATCH_SIZE);
    const ins = await supabase.from("postal_areas_import_stage").insert(batch);
    if (ins.error) throw ins.error;
    const done = Math.min(i + STAGE_BATCH_SIZE, parsedRows.length);
    if (done % 5000 === 0 || done === parsedRows.length) {
      console.log(`  - staged ${done.toLocaleString()} / ${parsedRows.length.toLocaleString()}`);
    }
  }

  console.log("[5/5] Rebuilding postal_areas from stage ...");
  const rpc = await supabase.rpc("rebuild_postal_areas_from_stage", {
    p_country_code: country,
    p_point_radius_m: args.radius,
  });
  if (rpc.error) throw rpc.error;
  console.log("Rebuild result:", rpc.data);

  const countRes = await supabase
    .from("postal_areas")
    .select("id", { count: "exact", head: true })
    .eq("country_code", country);
  if (countRes.error) throw countRes.error;
  console.log(`postal_areas rows for ${country}: ${countRes.count?.toLocaleString() ?? "unknown"}`);

  if (!args.keepStage) {
    const cleanStage = await supabase
      .from("postal_areas_import_stage")
      .delete()
      .eq("country_code", country);
    if (cleanStage.error) throw cleanStage.error;
    console.log("Stage rows cleaned.");
  } else {
    console.log("Keeping stage rows (--keep-stage).");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exitCode = 1;
});
