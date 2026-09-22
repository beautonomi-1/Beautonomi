#!/usr/bin/env node
/** Patch t-sa-mobile-refined.json for residual gate failures (intentional + short chrome). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const refinedPath = path.join(root, "_maps/t-sa-mobile-refined.json");
const data = JSON.parse(fs.readFileSync(refinedPath, "utf8"));

const rows = {
  Filter: {
    af: "Filtreer",
    zu: "Hlunga",
    xh: "Hluza",
    st: "Sefa",
    nso: "Sefa",
    tn: "Sefa",
    ts: "Hlawula",
    ve: "Hlawulela",
    ss: "Hlunga",
  },
  Instagram: {
    af: "Instagram",
    zu: "Instagram",
    xh: "Instagram",
    st: "Instagram",
    nso: "Instagram",
    tn: "Instagram",
    ts: "Instagram",
    ve: "Instagram",
    ss: "Instagram",
  },
  "App Store / Play Store": {
    af: "App Store / Play Store",
    zu: "App Store / Play Store",
    xh: "App Store / Play Store",
    st: "App Store / Play Store",
    nso: "App Store / Play Store",
    tn: "App Store / Play Store",
    ts: "App Store / Play Store",
    ve: "App Store / Play Store",
    ss: "App Store / Play Store",
  },
  "Buzzer / intercom": {
    af: "Intercom / buzzer",
    zu: "I-intercom / ibhaza",
    xh: "I-intercom / ibhaza",
    st: "Intercom / buzzer",
    nso: "Intercom / buzzer",
    tn: "Intercom / buzzer",
    ts: "Intercom / buzzer",
    ve: "Intercom / buzzer",
    ss: "I-intercom / libhaza",
  },
  "{{count}} hr": {
    af: "{{count}} uur",
    zu: "{{count}} hr",
    xh: "{{count}} hr",
    st: "{{count}} hr",
    nso: "{{count}} hr",
    tn: "{{count}} hr",
    ts: "{{count}} hr",
    ve: "{{count}} hr",
    ss: "{{count}} hr",
  },
  "{{hours}}h": {
    af: "{{hours}} u",
    zu: "{{hours}}h",
    xh: "{{hours}}h",
    st: "{{hours}}h",
    nso: "{{hours}}h",
    tn: "{{hours}}h",
    ts: "{{hours}}h",
    ve: "{{hours}}h",
    ss: "{{hours}}h",
  },
  "{{minutes}} min": {
    af: "{{minutes}} min",
    zu: "{{minutes}} imin",
    xh: "{{minutes}} imin",
    st: "{{minutes}} mets",
    nso: "{{minutes}} mets",
    tn: "{{minutes}} mets",
    ts: "{{minutes}} min",
    ve: "{{minutes}} min",
    ss: "{{minutes}} imin",
  },
  "Marketing lines on the website (e.g. hero text on /pricing) are edited in Admin → Content, not here.": {
    af: "Bemarkingsreels op die webwerf (bv. helde-teks op /pricing) word in Admin → Content redigeer, nie hier nie.",
    zu: "Imigqa yokumaketha kuwebhusayithi (isb. umbhalo we-hero ku-/pricing) ihlelwa ku-Admin → Content, hhayi lapha.",
    xh: "Iilayini zokurhweba kwiwebhusayithi (umz. isicatshulwa se-hero kwi-/pricing) zihlelwa ku-Admin → Content, hayi apha.",
    st: "Mela ya papatso sebakeng sa marang-rang (mohl. mongolo oa hero ho /pricing) e hlophisoa ho Admin → Content, eseng mona.",
    nso: "Mela ya papatšo wepesaeteng (mohl. sengwalwa sa hero go /pricing) e lokišetšwa go Admin → Content, e sego fano.",
    tn: "Mela ya papatso mo weposaiteng (mohl. sengwalwa sa hero go /pricing) e lokišetšwa go Admin → Content, e sego fano.",
    ts: "{{minutes}} min",
    ve: "Mila ya u hangisa eka webusaiti (xik. tsalwa ra hero eka /pricing) yi lulamisiwa eka Admin → Content, ku nga ri laha.",
    ss: "Imigca yekumaketha kuwebhusayithi (sib. umbalo we-hero ku-/pricing) ilungiswa ku-Admin → Content, hhayi lapha.",
  },
};

for (const [en, row] of Object.entries(rows)) {
  data[en] = row;
}

fs.writeFileSync(refinedPath, JSON.stringify(data, null, 2) + "\n");
console.log(`Patched ${Object.keys(rows).length} refined rows`);
