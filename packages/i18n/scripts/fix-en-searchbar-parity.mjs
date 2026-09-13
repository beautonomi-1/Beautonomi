#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const enPath = path.join(__dirname, "../src/locales/en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));

const sb = en.web.global.searchBar;
Object.assign(sb, {
  searchPlaceholder: "Search services, providers, or locations",
  where: "Where",
  when: "When",
  search: "Search",
  serviceAvailable: "Service available in your area",
  serviceUnavailable: "Service may not be available in this area",
  hairStyling: "Hair & styling",
  nails: "Nails",
  eyebrowsEyelashes: "Eyebrows & eyelashes",
  massage: "Massage",
  barbering: "Barbering",
});

en.web.global.loginModal.signUpSubtitle =
  "Create an account to book beauty services near you.";

fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);
console.log("en.json searchBar/loginModal parity fixed");
