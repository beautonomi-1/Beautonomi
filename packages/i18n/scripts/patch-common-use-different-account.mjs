#!/usr/bin/env node
/** Parity for common.useDifferentAccount* (customer surfaces CI). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TARGET_LOCALES,
  LOCALES_DIR,
  isCustomerSurfaceLeftover,
  flattenLocale,
  auditCustomerSurfaces,
} from "./_customer-surfaces-scope.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8"));
const EN = {
  useDifferentAccount: en.common.useDifferentAccount,
  useDifferentAccountConfirmTitle: en.common.useDifferentAccountConfirmTitle,
  useDifferentAccountConfirmBody: en.common.useDifferentAccountConfirmBody,
};

/** @type {Record<string, Partial<typeof EN>>} */
const BY_LOCALE = {
  fr: {
    useDifferentAccount: "Utiliser un autre compte",
    useDifferentAccountConfirmTitle: "Changer de compte ?",
    useDifferentAccountConfirmBody:
      "Vous serez déconnecté sur cet appareil. Votre compte Google ou Apple reste lié, et toute progression de configuration enregistrée reste sur ce compte. Vous pourrez vous reconnecter à tout moment.",
  },
  ar: {
    useDifferentAccount: "استخدام حساب آخر",
    useDifferentAccountConfirmTitle: "تبديل الحساب؟",
    useDifferentAccountConfirmBody:
      "سيتم تسجيل خروجك على هذا الجهاز. يظل حساب Google أو Apple مرتبطًا، وأي تقدم محفوظ في الإعداد يبقى على ذلك الحساب. يمكنك تسجيل الدخول مرة أخرى في أي وقت.",
  },
  sw: {
    useDifferentAccount: "Tumia akaunti nyingine",
    useDifferentAccountConfirmTitle: "Badilisha akaunti?",
    useDifferentAccountConfirmBody:
      "Utatoka kwenye kifaa hiki. Akaunti yako ya Google au Apple itabaki kuhusishwa, na maendeleo yoyote yaliyohifadhiwa ya usanidi yatabaki kwenye akaunti hiyo. Unaweza kuingia tena wakati wowote.",
  },
  af: {
    useDifferentAccount: "Gebruik 'n ander rekening",
    useDifferentAccountConfirmTitle: "Van rekening wissel?",
    useDifferentAccountConfirmBody:
      "Jy sal op hierdie toestel afmeld. Jou Google- of Apple-rekening bly gekoppel, en enige gestoorde opstelvordering bly op daardie rekening. Jy kan enige tyd weer aanmeld.",
  },
  zu: {
    useDifferentAccount: "Sebenzisa i-akhawunti ehlukile",
    useDifferentAccountConfirmTitle: "Shintsha i-akhawunti?",
    useDifferentAccountConfirmBody:
      "Uzophuma kule divayisi. I-akhawunti yakho ye-Google noma ye-Apple ihlala ixhunyiwe, futhi noma yikuphi ukuqhubeka kokusetha okulondoloziwe kuhlala kuleyo akhawunti. Ungangena futhi noma nini.",
  },
  xh: {
    useDifferentAccount: "Sebenzisa iakhawunti ehlukileyo",
    useDifferentAccountConfirmTitle: "Tshintsha iakhawunti?",
    useDifferentAccountConfirmBody:
      "Uza kuphuma kwesi sixhobo. Iakhawunti yakho yeGoogle okanye yeApple ihlala idityaniswe, kwaye naziphi na iinkqubela zokusetalwa ezilondoloziweyo zihlala kule akhawunti. Ungangena kwakhona nangaliphi na ixesha.",
  },
  st: {
    useDifferentAccount: "Sebelisa akhaonto e fapaneng",
    useDifferentAccountConfirmTitle: "Fetola akhaonto?",
    useDifferentAccountConfirmBody:
      "U tla tsoa sesebedisweng sena. Akhaonto ea hau ea Google kapa ea Apple e lula e hokahane, 'me tsoelo-pele efe kapa efe e bolokiloeng ea ho hlophisa e lula e le akhaontong eo. O ka kena hape nako efe kapa efe.",
  },
  nso: {
    useDifferentAccount: "Šomiša akhaonte e fapanego",
    useDifferentAccountConfirmTitle: "Fetola akhaonte?",
    useDifferentAccountConfirmBody:
      "O tla tšwa sedirišweng se. Akhaonte ya gago ya Google goba ya Apple e dula e kgokagantswe, gomme kgokagano efe goba efe ya peakanyo ye e bolokilwego e dula mo akhaonteng yeo. O ka tsena gape nako efe goba efe.",
  },
  tn: {
    useDifferentAccount: "Dirisa akhaonte e nngwe",
    useDifferentAccountConfirmTitle: "Fetola akhaonte?",
    useDifferentAccountConfirmBody:
      "O tla tswa mo sedirisweng se. Akhaonte ya gago ya Google kgotsa ya Apple e nne e amanngwe, mme tswelelopele epe e e bolokilweng ya peakanyo e nne mo akhaonteng e. O ka tsena gape nako nngwe le nngwe.",
  },
  ts: {
    useDifferentAccount: "Tirhisa akhawunti yin'wana",
    useDifferentAccountConfirmTitle: "Cin'wana akhawunti?",
    useDifferentAccountConfirmBody:
      "U ta huma eka xitirhisiwa lexi. Akhawunti ya wena ya Google kumbe ya Apple yi tshama yi hlangene, naswona nhluvuko wun'wana na wun'wana lowu hlayisiweke wa ku endla swi tshama eka akhawunti leyo. U nga nghena nakambe nkarhi wun'wana na wun'wana.",
  },
  ve: {
    useDifferentAccount: "Shumisa akhaunte iṅwe",
    useDifferentAccountConfirmTitle: "Shandukisa akhaunte?",
    useDifferentAccountConfirmBody:
      "U do u bva kha tshishumiswa itshi. Akhaunte yavho ya Google kana ya Apple i ya sala i tanganywaho, nahone mvelaphanda iṅwe na iṅwe yo fhadzwa ya u lugisa i ya sala kha akhaunte iyo. Ni nga dzhena hafhu tshifhinga tshine na tshine.",
  },
  ss: {
    useDifferentAccount: "Sebentisa i-akhawunti lehlukile",
    useDifferentAccountConfirmTitle: "Shintja i-akhawunti?",
    useDifferentAccountConfirmBody:
      "Utawuphuma kule divayisi. I-akhawunti yakho ye-Google nobe ye-Apple yahlala ixhunyiwe, futsi nobe ngutiphi inchubekela yokuhlela leyigciniwe yahlala kuleyo akhawunti. Ungangena futsi noma nini.",
  },
  pt: {
    useDifferentAccount: "Usar outra conta",
    useDifferentAccountConfirmTitle: "Mudar de conta?",
    useDifferentAccountConfirmBody:
      "Você sairá neste dispositivo. Sua conta Google ou Apple permanece vinculada, e qualquer progresso de configuração salvo permanece nessa conta. Você pode entrar novamente a qualquer momento.",
  },
  es: {
    useDifferentAccount: "Usar otra cuenta",
    useDifferentAccountConfirmTitle: "¿Cambiar de cuenta?",
    useDifferentAccountConfirmBody:
      "Cerrarás sesión en este dispositivo. Tu cuenta de Google o Apple sigue vinculada, y cualquier progreso de configuración guardado permanece en esa cuenta. Puedes iniciar sesión de nuevo en cualquier momento.",
  },
  it: {
    useDifferentAccount: "Usa un altro profilo",
    useDifferentAccountConfirmTitle: "Cambiare profilo?",
    useDifferentAccountConfirmBody:
      "Uscirai da questo dispositivo. Il tuo profilo Google o Apple resta collegato e ogni avanzamento della configurazione salvato resta su quel profilo. Puoi accedere di nuovo in qualsiasi momento.",
  },
  de: {
    useDifferentAccount: "Anderes Konto verwenden",
    useDifferentAccountConfirmTitle: "Konto wechseln?",
  },
  nl: {
    useDifferentAccount: "Ander account gebruiken",
    useDifferentAccountConfirmTitle: "Van account wisselen?",
  },
  id: {
    useDifferentAccount: "Gunakan akun lain",
    useDifferentAccountConfirmTitle: "Ganti akun?",
  },
  tr: {
    useDifferentAccount: "Farklı bir hesap kullanın",
    useDifferentAccountConfirmTitle: "Hesap değiştirilsin mi?",
  },
};

function deepSet(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object" || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

let updated = 0;
for (const locale of TARGET_LOCALES) {
  const patch = BY_LOCALE[locale];
  if (!patch) continue;
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  for (const [field, value] of Object.entries(patch)) {
    const enVal = EN[field];
    if (typeof enVal !== "string" || typeof value !== "string") continue;
    const key = `common.${field}`;
    const flat = flattenLocale(data);
    const current = flat.get(key);
    if (typeof current === "string" && !isCustomerSurfaceLeftover(enVal, current)) continue;
    if (isCustomerSurfaceLeftover(enVal, value)) {
      console.warn(`Skip ${locale} ${field}: still leftover`);
      continue;
    }
    deepSet(data, key, value);
    updated += 1;
  }
  safeWriteJson(filePath, data);
}

const after = auditCustomerSurfaces();
console.log(`Updated ${updated} fields; total leftover: ${after.totalLeftover}`);
process.exit(after.totalLeftover === 0 ? 0 : 1);
