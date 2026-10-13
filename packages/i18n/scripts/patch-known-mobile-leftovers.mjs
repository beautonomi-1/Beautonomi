#!/usr/bin/env node
/** Patch known stubborn mobile leftover phrases across SA + fr + ar. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeWriteJson } from "./_safe-write-json.mjs";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const TARGET = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "fr", "ar"];

/** en phrase -> per-locale translation */
const PHRASES = {
  "This address is outside your service area.": {
    af: "Hierdie adres is buite u diensarea.",
    zu: "Leli ikheli likule ngaphandle kwendawo yakho yesevisi.",
    xh: "Le dilesi likangaphandle kwindawo yenkonzo yakho.",
    st: "Aterese ena e kantle ho sebaka sa hau sa tshebeletso.",
    nso: "Aterese ye e ka ntle ga sebaka sa gago sa tirelo.",
    tn: "Aterese eno e fa kgaogano ya tiragalo ya gago.",
    ts: "Adirese leyi i e handle ka ndhawu ya vukorhokeri bya wena.",
    ve: "Adresi iyi i hanu ha tshifhinga tsha u shumisa tshavha.",
    ss: "Leli likheli likule ngaphandle kwendawo yakho yesevisi.",
    fr: "Cette adresse est en dehors de votre zone de service.",
    ar: "هذا العنوان خارج منطقة خدمتك.",
  },
  "Could not validate this address. Check your connection and try again.": {
    af: "Kon nie hierdie adres bekragtig nie. Gaan u verbinding na en probeer weer.",
    zu: "Ayikwazanga ukuqinisekisa leli kheli. Hlola ukuxhumeka kwakho bese uzama futhi.",
    xh: "Ayikwazanga ukuqinisekisa le dilesi. Jonga uqhagamshelo lwakho uzame kwakhona.",
    st: "Ha re khone ho netefatsa aterese ena. Sheba khokahanyo ea hau u leke hape.",
    nso: "Ga re kgone go netefatsa aterese ye. Lekola kgokagano ya gago o leke gape.",
    tn: "Ga re kgone go netefatsa aterese eno. Lekola kgokaganyo ya gago o leke gape.",
    ts: "A swi kotekanga ku tiyisisa adirese leyi. Languta vuxokoxoko bya wena u ringeta nakambe.",
    ve: "A zwi kone u khwaṱhisedza adrese iyi. Sedzani vhukwamani ha vhone ni lingedze hafhu.",
    ss: "Ayikwazanga ukuqinisekisa leli kheli. Hlola ukuxhumeka kwakho bese uzama futsi.",
    fr: "Impossible de valider cette adresse. Vérifiez votre connexion et réessayez.",
    ar: "تعذّر التحقق من هذا العنوان. تحقق من اتصالك وحاول مرة أخرى.",
  },
  "Viewers hear this music instead of your clip's audio on Explore.": {
    af: "Kykers hoor hierdie musiek in plaas van u clip se klank op Verken.",
    zu: "ababukeli bayizwa le ngoma esikhundleni somsindo we-clip yakho ku-Explore.",
    xh: "ababukeli bayiva le mculo endaweni yomsindo we-clip yakho kwi-Explore.",
    st: "Babali ba utloa mmino ona ho fapana le molumo oa clip ea hau ho Explore.",
    nso: "Bapalami ba utlwa mmino wo go e na le modumo wa clip ya gago go Explore.",
    tn: "Bapalami ba utlwa mmino wo go e na le modumo wa clip ya gago go Explore.",
    ts: "Vavoni va twa vuyimbelo lebyi endhawini ya rito ra clip ya wena eka Explore.",
    ve: "Vhasheni vha tamba vhuyimbo uhu fhindano ha luṅwalo lwa clip yawe kha Explore.",
    ss: "Babukeli bayiva le mculo endzaweni yomsindo we-clip yakho ku-Explore.",
    fr: "Les spectateurs entendent cette musique au lieu de l'audio de votre clip dans Explorer.",
    ar: "يسمع المشاهدون هذه الموسيقى بدلاً من صوت مقطعك في Explorer.",
  },
  "No catalog tracks yet — use original audio or ask your admin to add platform sounds.": {
    af: "Nog geen katalogussnitte nie — gebruik oorspronklike klank of vra u admin om platformklanke by te voeg.",
    zu: "Awekho amathrekhi ekhatalogi okwamanje — sebenzisa umsindo wokuqala noma cela umlawuli wakho afake imisindo yepulatifomu.",
    xh: "Akukho ziqendu zekhatalogi okwangoku — sebenzisa umsindo wokuqala okanye ucele umlawuli ukongeza imisindo yeplatfomu.",
    st: "Ha ho na li-track tsa khalase ho fihlela joale — sebelisa molumo oa mantlha kapa kopa admin ea hau ho eketsa molumo oa sethala.",
    nso: "Ga go na di-track tsa khalase go fitlha jaanong — dirisa modumo wa mathomo goba kgopela admin ya gago go oketsa modumo wa sethala.",
    tn: "Ga go na di-track tsa khalase go fitlha jaanong — dirisa modumo wa mathomo goba kgopela admin ya gago go oketsa modumo wa sethala.",
    ts: "A ku na ti-track ta khatalogo ku fikela sweswi — tirhisa rito ro sungula kumbe kombela admin wa wena ku engetela marito ya platform.",
    ve: "A hu na zwiimbo zwa khatalogi zwino — shandisa luṅwalo lwa u thoma kana humbela admin ya vhone u engedze marito a platform.",
    ss: "Akukho emathrekhi ekhatalogi okwamanje — sebenzisa umsindo wokuqala noma cela umlawuli afake imisindo yepulatifomu.",
    fr: "Aucune piste du catalogue pour l'instant — utilisez l'audio d'origine ou demandez à votre admin d'ajouter des sons de la plateforme.",
    ar: "لا توجد مسارات في الكatalog بعد — استخدم الصوت الأصلي أو اطلب من المسؤول إضافة أصوات المنصة.",
  },
  "Connect API keys in the provider web app under Ecommerce → Shipping.": {
    af: "Koppel API-sleutels in die verskaffer-webapp onder Ecommerce → Versending.",
    zu: "Xhuma amakhiye e-API ku-app yewebhu yomhlinzeki ngaphansi kwe-Ecommerce → Shipping.",
    xh: "Qhagamshela izitshixo ze-API kwi-app yewebhu yomniki-nkonzo phantsi kwe-Ecommerce → Shipping.",
    st: "Hokahanya linotlolo tsa API ho app ea web ea mofani tlasa Ecommerce → Shipping.",
    nso: "Kgokaganya dikonopo tsa API go app ya web ya mophaka tlase ga Ecommerce → Shipping.",
    tn: "Kgokaganya dikonopo tsa API go app ya web ya mophaka tlase ga Ecommerce → Shipping.",
    ts: "Hlanganisa swikhi swo API eka app ya web ya mupfuni ehansi ka Ecommerce → Shipping.",
    ve: "Kopani swikhi sa API kha app ya web ya mupemi fhasi ha Ecommerce → Shipping.",
    ss: "Xhuma amakhiye e-API ku-app yewebhu yomniketi ngaphansi kwe-Ecommerce → Shipping.",
    fr: "Connectez les clés API dans l'application web prestataire sous E-commerce → Expédition.",
    ar: "اربط مفاتيح API في تطبيق الويب للمزود ضمن التجارة الإلكترونية → الشحن.",
  },
};

function replacePhraseInTree(obj, enPhrase, translated) {
  let n = 0;
  function walk(o) {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && v === enPhrase) {
        o[k] = translated;
        n += 1;
      } else if (v && typeof v === "object") walk(v);
    }
  }
  walk(obj);
  return n;
}

let total = 0;
for (const locale of TARGET) {
  const p = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  let n = 0;
  for (const [en, row] of Object.entries(PHRASES)) {
    const tr = row[locale];
    if (tr) n += replacePhraseInTree(data, en, tr);
  }
  if (n) safeWriteJson(p, data);
  console.log(`${locale}: replaced ${n}`);
  total += n;
}
console.log("total replacements:", total);
