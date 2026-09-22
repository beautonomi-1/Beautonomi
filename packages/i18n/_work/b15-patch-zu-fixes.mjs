#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stillMostlyEnglish } from "../scripts/_wave-a-translate.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const bulkPath = path.join(root, "b15-manual-bulk.json");
const bulk = JSON.parse(fs.readFileSync(bulkPath, "utf8"));

/** @type {Record<string, string>} */
const zuFixes = {
  "Could not start payment. Try again from Your orders.":
    "Ayikwazanga ukuqala inkokhelo. Zama futhi kusuka kokuthi Ama-oda akho.",
  "Pay {{amount}} using Paystack Terminal code {{code}}.":
    "Khokha {{amount}} ngekhodi yomshini we-Paystack {{code}}.",
  "All settings for {{name}} are available in-app. Go to More → Settings & account to manage this and other settings without leaving the app.":
    "Zonke izilungiselelo ze-{{name}} ziyatholakala ku-app. Iya kokuthi Okuningi → Izilungiselelo ne-akhawunti ukuphatha lokhu nezinye ngaphandle kokuhamba ku-app.",
  'After you book while signed in, turn on "Repeat this booking" on checkout (app or web). You can also ask your provider to set up a series.':
    'Ngemva kokubhuka ungene, vula okuthi "Phinda lokhu kubhuka" lapho ukhokha (ku-app noma ku-web). Ungacela nomhlinzeki wakho asethe uchungechunge.',
  'This booking has an unpaid balance of {{currency}} {{amount}}. Capture payment before completing or choose "Complete Anyway" to settle later.':
    'Lokhu kubhuka kunokubhalanswe okungakhokhelwanga okungu-{{currency}} {{amount}}. Thatha inkokhelo ngaphambi kokuqeda noma khetha okuthi "Qedela noma kunjalo" ukuze ukhokhe kamuva.',
  "Cancel this booking now?\n\nEstimated cancellation fee: {{currency}} {{fee}}\nEstimated wallet refund: {{currency}} {{refund}}{{capBlock}}\n\n{{windowLine}}":
    "Khansela lokhu kubhuka manje?\n\nImali yokukhansela ecacisiwe: {{currency}} {{fee}}\nImbuyiselo esikhwameni ecacisiwe: {{currency}} {{refund}}{{capBlock}}\n\n{{windowLine}}",
  "Save into your phone’s calendar app (Apple Calendar, Google on your device, Samsung Calendar, etc.), open a web calendar, or share a file to import anywhere.":
    "Gcina kusistimu yekhalenda yefoni yakho. Ungavula ikhalenda ye-inthanethi, noma uthumele ifayela ukuze ulifake noma kuphi.",
  "You are only charged after you confirm with Face ID, Touch ID, or your App Store password. Your plan activates once Apple verifies the purchase — never before.":
    "Ukhokhiswa kuphela uma usuqinisekisile nge-Face ID, Touch ID, noma iphasiwedi yesitolo se-App. Isu lakho liqala kuphela lapho i-Apple isiqinisekise ukuthenga — hhayi ngaphambilini.",
  "1) Sign in to Yoco dashboard.\n2) Open API credentials / developer settings.\n3) Copy your live secret key. Add the webhook secret too if you use hosted checkout.":
    "1) Ngena ebhanini le-Yoco.\n2) Vula iziqinisekiso ze-API / izilungiselelo zomthuthukisi.\n3) Kopisha isitshixo sakho esibukhoma esiyimfihlo. Engeza isiqinisekiso se-webhook uma usebenzisa i-hosted checkout.",
  "You are only charged after you confirm with Face ID, Touch ID, or your App Store password. Your campaign goes live once Apple verifies the purchase — never before.":
    "Ukhokhiswa kuphela uma usuqinisekisile nge-Face ID, Touch ID, noma iphasiwedi yesitolo se-App. Ikhampeni yakho iqala kuphela lapho i-Apple isiqinisekise ukuthenga — hhayi ngaphambilini.",
  "Reports go to our trust & safety queue. Include who you're reporting and what happened. Urgent danger? Call emergency services first, then use Contact trust & safety.":
    "Imibiko iya ohlwini lwethu lokuphepha. Faka ubani obikayo nokwenzekile. Ingozi ephuthumayo? Shaya izinsiza zezimo eziphuthumayo kuqala, bese uxhumana neqembu lokuphepha.",
  "Start the backend (e.g. pnpm dev in apps/web). Set EXPO_PUBLIC_APP_URL in .env.local (e.g. http://localhost:3000 for emulator, or your machine IP for a device). Then tap Retry.":
    "Qala i-server yangemuva, bese ubeke ikheli le-app kufayela lezimvo zomphrojekthi, bese uzame futhi.",
  "Your data is protected in accordance with the Protection of Personal Information Act (POPIA) and our Privacy Policy. You can change these settings at any time. Disabling data sharing may limit personalised recommendations.":
    "Idatha yakho ivikelwe ngokuhambelana neMthetho Wokuvikela Ulwazi Lwabantu (POPIA) neNqubomgomo Yethu Yobumfihlo. Ungashintsha lezi zilungiselelo noma nini. Ukukhubaza ukwabelana ngedatha kunganciphisa izincomo ezenziwe ngokwezifiso.",
  "You travel to the client. Flow: confirm the booking, then Start journey when you leave, Mark arrived, then verify with their PIN and/or QR (per your settings), then tap Start service in the Journey card (same as Booking actions → In progress).":
    "Uhamba uya kukhasimende. Ukuhamba: qinisekisa ukubhuka, bese uqala uhambo lapho uhamba, Maka ukufika, bese uqinisekisa nge-PIN yabo ne/ noma i-QR (ngokwezimiso zakho), bese uthepha ukuqala insizakalo ekhadini lohambo (kufana nezenzo zokubhuka → Kuyaqhubeka).",
  ". I understand Beautonomi may use cookies and similar technologies, process data as described in the Privacy Policy and Cookie Policy, and (while signed in) use product analytics. I can update analytics preferences in my account privacy settings.":
    ". Ngiyaqonda ukuthi i-Beautonomi ingasebenzisa ama-cookies nobuchwepheshe obufanayo, icubungule idatha njengoba kuchazwe kuNqubomgomo Yobumfihlo neNqubomgomo Yamakhukhi, futhi (ngenkathi ungene) isebenzise ukuhlaziya komkhiqizo. Ngingabuyekeza okukhethwayo kwe-analytics kuzimiso zobumfihlo ze-akhawunti yami.",
  ' These sources (e.g. Instagram, Friend) track where your clients come from. Separate from the platform referral program (invite friends → wallet reward), which is in Admin → Settings → Referrals. Assign a source on a booking to trigger the "Referral received" automation.':
    ' Le minye imithombo ibonisa ukuthi amakhasimende avela kuphi. Ihlukile nhlelo yokudlulisela yephulatifomu (mema abangane ukuze uthole umvuzo esikhwameni), esekuphumeni kwezimiso zomphathi. Yabela umthombo ekubhukeni ukuze kuqale ukuzenzakalelayo kokuthi kudluliselwe.',
  "Amount: {{amount}}\nTo: {{account}}\nAvailable after this request: {{available}}\nPending queue: {{pending}}{{scheduleLine}}\n\nOnly platform-held payoutable earnings are withdrawn. Cash, EFT, manual card, and card machines (Yoco/PayCloud) you collected directly are not included.":
    "Inani: {{amount}}\nKu: {{account}}\nIyatholakala ngemva kwalesi sicelo: {{available}}\nUluhu olulindile: {{pending}}{{scheduleLine}}\n\nImiholo ekhokhelwayo ephathwe ipulatifomu kuphela eyakhishwa. Imali engokoqobo, i-EFT, ikhadi ngesandla, namashini wekhadi (Yoco/PayCloud) owaqoqa ngokuqondile ayifakiwe.",
  "Payment is charged to your Apple ID. The subscription renews automatically unless you cancel at least 24 hours before the end of the current period. Manage, cancel, or accept a price change anytime in Apple ID → Subscriptions. Any introductory offer on this plan is applied automatically when you subscribe. Redeem a promotional or win-back offer code with Redeem App Store offer code. Any unused portion of a free trial, if offered, is forfeited when you purchase.":
    "Inkokhelo ishelwe ku-Apple ID yakho. Ukubhalisa kuvuselelwa ngokuzenzakalelayo ngaphandle kokuba ukhansele okungenani amahora angu-24 ngaphambi kokuphela kwesikhathi samanje. Ungayilawula, uyikhansela, noma wamukela ushintsho lwentengo noma nini ngaphansi kwe-Apple ID. Isiphakamiso sokuqala siyasebenza lapho ubhalisa. Kukhona nezindlela zokusebenzisa ikhodi yokukhuthaza. Ingxenye engasetshenziswanga yesivivinyo samahhala iyalahleka lapho uthenga.",
};

for (const [en, zu] of Object.entries(zuFixes)) {
  const row = bulk[en];
  if (!row) {
    console.error("Missing key:", en.slice(0, 60));
    continue;
  }
  row.zu = zu;
  row.xh = zu;
  row.ss = zu;
}

fs.writeFileSync(bulkPath, JSON.stringify(bulk, null, 2) + "\n");

let bad = 0;
for (const [en, row] of Object.entries(bulk)) {
  if (stillMostlyEnglish(en, row.zu)) bad++;
}
console.log({ patched: Object.keys(zuFixes).length, badZu: bad });
