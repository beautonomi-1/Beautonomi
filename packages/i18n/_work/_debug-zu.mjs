#!/usr/bin/env node
import { stillMostlyEnglish } from "../scripts/_wave-a-translate.mjs";

const cases = [
  ["Save into your phone's calendar app (Apple Calendar, Google on your device, Samsung Calendar, etc.), open a web calendar, or share a file to import anywhere.",
   "Gcina kusistimu yaso yekhalenda yefoni (i-Apple Calendar, i-Google kudivayisi, i-Samsung Calendar, njll.), vule ikhalenda ye-inthanethi, noma thumela ifayela ukuze ulifake noma kuphi."],
  ["Reports go to our trust & safety queue. Include who you're reporting and what happened. Urgent danger? Call emergency services first, then use Contact trust & safety.",
   "Imibiko iya ohlwini lwethu lwe-trust & safety. Faka ubani obikayo nokwenzekile. Ingozi ephuthumayo? Shaya izinsiza zezimo eziphuthumayo kuqala, bese uxhumana ne-trust & safety."],
  ["Start the backend (e.g. pnpm dev in apps/web). Set EXPO_PUBLIC_APP_URL in .env.local (e.g. http://localhost:3000 for emulator, or your machine IP for a device). Then tap Retry.",
   "Qala umsebenzi wangemuva (isb. pnpm dev ku-apps/web). Beka i-EXPO_PUBLIC_APP_URL ku-.env.local (isb. http://localhost:3000 ku-emulator, noma i-IP yomshini wedivayisi). Bese ucindezele ukuze uzame futhi."],
  [' These sources (e.g. Instagram, Friend) track where your clients come from. Separate from the platform referral program (invite friends → wallet reward), which is in Admin → Settings → Referrals. Assign a source on a booking to trigger the "Referral received" automation.',
   ' Lezi zinsiza (isb. Instagram, Friend) zibonisa ukuthi amakhasimende akho avela kuphi. Zihlukile nhlelo yokudlulisela yephulatifomu (mema abangane → umvuzo wesikhwama), eseku-Admin → Izilungiselelo → Referrals. Yabela umthombo ekubhukeni ukuze kuqale ukwenziwa okuzenzakalelayo okuthi "Referral received".'],
  ["Payment is charged to your Apple ID. The subscription renews automatically unless you cancel at least 24 hours before the end of the current period. Manage, cancel, or accept a price change anytime in Apple ID → Subscriptions. Any introductory offer on this plan is applied automatically when you subscribe. Redeem a promotional or win-back offer code with Redeem App Store offer code. Any unused portion of a free trial, if offered, is forfeited when you purchase.",
   "Inkokhelo ishelwe ku-Apple ID yakho. Ukubhalisa kuvuselelwa ngokuzenzakalelayo ngaphandle kokuba ukhansele okungenani amahora angu-24 ngaphambi kokuphela kwesikhathi samanje. Lawula, khansela, noma wamukela ushintsho lwentengo noma nini ku-Apple ID → Subscriptions. Noma yisiphi isiphakamiso sokuqala kule plani siyasebenza lapho ubhalisa. Sebenzisa ikhodi yokukhuthaza noma yokubuyisa nge-Redeem App Store offer code. Ingxenye engasetshenziswanga yesivivinyo samahhala, uma inikezwa, iyalahleka lapho uthenga."],
];

import { BRANDS } from "../scripts/_wave-a-engine.mjs";
for (const [en, zu] of cases) {
  const brands = new Set(BRANDS.map((b) => b.toLowerCase()));
  const varNames = new Set([...String(en).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1].toLowerCase()));
  const keep = (w) => !brands.has(w) && !varNames.has(w) && !/^\{\{/.test(w);
  const enWords = (en.toLowerCase().match(/[a-z]{4,}/g) || []).filter(keep);
  const outWords = (zu.toLowerCase().match(/[a-z]{4,}/g) || []).filter(keep);
  const leftover = outWords.filter((w) => enWords.includes(w));
  console.log(stillMostlyEnglish(en, zu), leftover, en.slice(0,40));
}
