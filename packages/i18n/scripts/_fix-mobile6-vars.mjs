import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mapPath = path.join(root, "_maps/t-sa-mobile-6.json");
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));

const fixes = [
  [
    "− On hold (clears {{count}} days after each booking)",
    "zu",
    "− Isabanjiwe (isula izinsuku ezingama-{{count}} ngemva kokubhukha ngakunye)",
  ],
  [
    "− On hold (clears {{count}} days after each booking)",
    "xh",
    "− Imisiwe (icima iintsuku ezingama-{{count}} emva kokubhukisha ngakunye)",
  ],
  [
    "Duration must be between {{min}} and {{max}} minutes.",
    "st",
    "Nako e tlameha ho ba pakeng tsa {{min}} le {{max}} metsotso.",
  ],
  [
    "We'll send a {{count}}-digit code to verify your email.",
    "zu",
    "Sizothumela ikhodi enamadijithi angu-{{count}} ukuze siqinisekise i-imeyili yakho.",
  ],
  [
    "We'll send a {{count}}-digit code to verify your email.",
    "xh",
    "Siza kuthumela ikhowudi enamadijithi angu-{{count}} ukuqinisekisa i-imeyile yakho.",
  ],
  [
    "We'll send a {{count}}-digit code to verify your email.",
    "st",
    "Re tla romella khouto ea linomoro tse {{count}} ho netefatsa lengolo-tsoibila la hau.",
  ],
  [
    "We'll send a {{digits}}-digit code to verify your email.",
    "zu",
    "Sizothumela ikhodi enamadijithi angu-{{digits}} ukuze siqinisekise i-imeyili yakho.",
  ],
  [
    "We'll send a {{digits}}-digit code to verify your email.",
    "xh",
    "Siza kuthumela ikhowudi enamadijithi angu-{{digits}} ukuqinisekisa i-imeyile yakho.",
  ],
  [
    "We'll send a {{digits}}-digit code to verify your email.",
    "st",
    "Re tla romella khouto ea linomoro tse {{digits}} ho netefatsa lengolo-tsoibila la hau.",
  ],
  [
    "Use your Yoco terminal to complete card payment.{{extra}}",
    "tn",
    "Dirisa theminale ya gago ya Yoco go feleletsa tuelo ya karata.{{extra}}",
  ],
  [
    "Use your Yoco terminal to complete card payment.{{extra}}",
    "ve",
    "Shumisani theminala yaṋu ya Yoco u fhedza u badela nga garaṱa.{{extra}}",
  ],
  [
    "Use your Yoco terminal to complete card payment.{{extra}}",
    "ss",
    "Sebentisa itheminali yakho Yoco kute ucedzele kukhokha ngelikhadi.{{extra}}",
  ],
  [
    "{{count}} booking request from past dates need your attention",
    "zu",
    "{{count}} isicelo sokubhukha sezinsuku ezedlule sidinga ukunakwa kwakho",
  ],
  [
    "{{count}} booking request from past dates need your attention",
    "xh",
    "{{count}} isicelo sokubhukisha ukusuka kwimihla edlulileyo sidinga ingqalelo yakho",
  ],
];

for (const [en, loc, val] of fixes) {
  map[en][loc] = val;
}

fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
console.log(`Fixed ${fixes.length} locale cells`);
