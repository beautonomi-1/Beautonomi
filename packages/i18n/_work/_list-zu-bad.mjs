#!/usr/bin/env node
import fs from "node:fs";
import { stillMostlyEnglish, isIdentity } from "../scripts/_wave-a-translate.mjs";

const map = JSON.parse(
  fs.readFileSync(new URL("../_maps/t-sa-mobile-15.json", import.meta.url), "utf8"),
);
for (const [en, r] of Object.entries(map)) {
  if (isIdentity(en)) continue;
  if (!r.zu || r.zu === en || stillMostlyEnglish(en, r.zu)) {
    console.log("---");
    console.log(en);
    console.log(r.zu);
  }
}
