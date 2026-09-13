#!/usr/bin/env node
/** Fill missing phoneInput hints and translate the ZA hint for all locales. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");

function writeLocale(localePath, data) {
  const tmp = `${localePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, localePath);
}

const HINT_ZA = {
  af: "Suid-Afrika eerste: slegs nasionale syfers (laat +27 weg). Voorbeeld: 82 123 4567 of 082 123 4567.",
  zu: "INingizimu Afrika kuqala: izinombolo zesizwe kuphela (shiya u-+27). Isibonelo: 82 123 4567 noma 082 123 4567.",
  xh: "UMzantsi Afrika kuqala: amanani esizwe kuphela (shiya u-+27). Umzekelo: 82 123 4567 okanye 082 123 4567.",
  st: "Afrika Boroa pele: linomoro tsa naha feela (tlohela +27). Mohlala: 82 123 4567 kapa 082 123 4567.",
  nso: "Afrika Borwa pele: dinomoro tša naga fela (tlogela +27). Mohlala: 82 123 4567 goba 082 123 4567.",
  tn: "Aforika Borwa pele: dinomoro tsa naga fela (tlogela +27). Sekao: 82 123 4567 kgotsa 082 123 4567.",
  ts: "Afrika Dzonga ku sungula: tinomboro ta tiko ntsena (tshika +27). Xikombiso: 82 123 4567 kumbe 082 123 4567.",
  ve: "Afrika Tshipembe u thoma: nomboro dza shango fhedzi (litsha +27). Tsumbo: 82 123 4567 kana 082 123 4567.",
  ss: "iNingizimu Afrika kucala: tinombolo tesive kuphela (shiya +27). Sibonelo: 82 123 4567 noma 082 123 4567.",
  fr: "Afrique du Sud d’abord : chiffres nationaux uniquement (sans +27). Ex. : 82 123 4567 ou 082 123 4567.",
  ar: "جنوب أفريقيا أولاً: الأرقام الوطنية فقط (بدون +27). مثال: 82 123 4567 أو 082 123 4567.",
  sw: "Afrika Kusini kwanza: tarakimu za kitaifa tu (acha +27). Mfano: 82 123 4567 au 082 123 4567.",
  pt: "África do Sul primeiro: só dígitos nacionais (omitir +27). Ex.: 82 123 4567 ou 082 123 4567.",
  es: "Sudáfrica primero: solo dígitos nacionales (omite +27). Ej.: 82 123 4567 o 082 123 4567.",
  "pt-BR": "África do Sul primeiro: só dígitos nacionais (omitir +27). Ex.: 82 123 4567 ou 082 123 4567.",
  "es-MX": "Sudáfrica primero: solo dígitos nacionales (omite +27). Ej.: 82 123 4567 o 082 123 4567.",
  de: "Südafrika zuerst: nur nationale Ziffern (ohne +27). Beispiel: 82 123 4567 oder 082 123 4567.",
  hi: "पहले दक्षिण अफ्रीका: केवल राष्ट्रीय अंक (+27 छोड़ें)। उदाहरण: 82 123 4567 या 082 123 4567।",
  it: "Sudafrica prima: solo cifre nazionali (ometti +27). Esempio: 82 123 4567 o 082 123 4567.",
  nl: "Zuid-Afrika eerst: alleen nationale cijfers (laat +27 weg). Voorbeeld: 82 123 4567 of 082 123 4567.",
  tr: "Önce Güney Afrika: yalnızca ulusal rakamlar (+27’yi yazma). Örnek: 82 123 4567 veya 082 123 4567.",
  id: "Afrika Selatan dulu: hanya digit nasional (hilangkan +27). Contoh: 82 123 4567 atau 082 123 4567.",
  am: "መጀመሪያ ደቡብ አፍሪካ፦ ብ�7.",
  am: "መጀመሪያ ደቡብ አፍሪካ፦ ብሔራዊ ቁጥሮች ብቻ (+27ን ይተዉ)። ምሳሌ፦ 82 123 4567 ወይም 082 123 4567።",
  rw: "Afurika y'Epfo mbere: imibare y'igihugu gusa (reka +27). Urugero: 82 123 4567 cyangwa 082 123 4567.",
};

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enPhone = en.web.global.phoneInput;

for (const file of fs.readdirSync(localesDir).filter((f) => f.endsWith(".json") && f !== "en.json")) {
  const code = file.replace(/\.json$/, "");
  if (code.startsWith("en-")) continue;
  const localePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  data.web ??= {};
  data.web.global ??= {};
  data.web.global.phoneInput = { ...enPhone, ...(data.web.global.phoneInput || {}) };
  if (HINT_ZA[code]) data.web.global.phoneInput.hintZa = HINT_ZA[code];
  writeLocale(localePath, data);
  console.log("updated", code);
}
