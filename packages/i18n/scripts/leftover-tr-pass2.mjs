#!/usr/bin/env node
/**
 * Sweep leftover English (and known calques) on public-flow keys for Wave A locales.
 * Exact overrides first, then the existing Wave A / fr-ar-sw translators.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pack } from "./_wave-a-engine.mjs";
import { translate as translateWaveA, stillMostlyEnglish } from "./_wave-a-translate.mjs";
import { translate as translateFrArSw } from "./_wave-a-fr-ar-sw.mjs";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const WAVE = ["pt", "es", "af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const FRARSW = ["fr", "ar", "sw"];
const ALIASES = { "pt-BR": "pt", "es-MX": "es" };
const ALL = [...WAVE, ...FRARSW];

const PREFIXES = [
  "common",
  "auth",
  "authGate",
  "web.global.loginModal",
  "web.global.phoneInput",
  "customer.mobile.screens.partnerProfile",
  "web.login",
  "web.cards",
  "web.categories",
  "web.layout.bottomNav",
  "web.layout.footer",
  "web.a11y",
  "web.booking",
  "web.book",
  "web.search.distanceAway",
  "web.search.distanceUnder1km",
];

const LOCAL = new Map();
function lex(en, ...vals) {
  if (vals.length !== 11) throw new Error(`lex "${en}" has ${vals.length}`);
  LOCAL.set(en, pack(vals));
}

// pt, es, af, zu, xh, st, nso, tn, ts, ve, ss
lex(
  "Don't have an account?",
  "Ainda não tem conta?",
  "¿No tienes una cuenta?",
  "Het jy nie 'n rekening nie?",
  "Awunayo i-akhawunti?",
  "Awunayo iakhawunti?",
  "Ha u na akhaonto?",
  "Ga o na akhauute?",
  "Ga o na akhauunte?",
  "A wu na akhawunti?",
  "A ni na akhaunte?",
  "Awunayo li-akhawunti?",
);
lex(
  "Continue with Google",
  "Continuar com o Google",
  "Continuar con Google",
  "Gaan voort met Google",
  "Qhubeka no-Google",
  "Qhubeka noGoogle",
  "Tsoela pele ka Google",
  "Tšwela pele ka Google",
  "Tswelela ka Google",
  "Yisa emahlweni hi Google",
  "Bvela phanḓa nga Google",
  "Chubeka nge-Google",
);
lex(
  "Continue with Apple",
  "Continuar com a Apple",
  "Continuar con Apple",
  "Gaan voort met Apple",
  "Qhubeka no-Apple",
  "Qhubeka noApple",
  "Tsoela pele ka Apple",
  "Tšwela pele ka Apple",
  "Tswelela ka Apple",
  "Yisa emahlweni hi Apple",
  "Bvela phanḓa nga Apple",
  "Chubeka nge-Apple",
);
lex(
  "Sign up",
  "Registar",
  "Registrarse",
  "Registreer",
  "Bhalisa",
  "Bhalisa",
  "Ngolisa",
  "Ngwadiša",
  "Nwadisa",
  "Tsarisa",
  "Ṅwalisa",
  "Bhalisa",
);
lex(
  "Log in",
  "Iniciar sessão",
  "Iniciar sesión",
  "Meld aan",
  "Ngena",
  "Ngena",
  "Kena",
  "Tsena",
  "Tsena",
  "Nghena",
  "Nngena",
  "Ngena",
);
lex(
  "Log out",
  "Terminar sessão",
  "Cerrar sesión",
  "Meld af",
  "Phuma",
  "Phuma",
  "Tsoa",
  "Tšwa",
  "Tswa",
  "Huma",
  "Bva",
  "Phuma",
);
lex("Email", "E-mail", "Correo", "E-pos", "I-imeyili", "I-imeyile", "Imeile", "Imeile", "Imeile", "Imeyili", "Imeili", "I-imeyili");
lex(
  "Forgot password?",
  "Esqueceu-se da palavra-passe?",
  "¿Olvidaste tu contraseña?",
  "Wagwoord vergeet?",
  "Uwakhohlwa iphasiwedi?",
  "Ulibele iphasiwedi?",
  "U lebetse phasewete?",
  "O lebetše phasewete?",
  "O lebetse phasewete?",
  "U rivele phasiwedi?",
  "No hangwa phasiwede?",
  "Uwakhohlwa liphaswedi?",
);
lex(
  "Already have an account?",
  "Já tem conta?",
  "¿Ya tienes una cuenta?",
  "Het jy al 'n rekening?",
  "Usuvele unayo i-akhawunti?",
  "Sele unayo iakhawunti?",
  "U se u na akhaonto?",
  "O šetše o na le akhauute?",
  "O setse o na le akhauunte?",
  "U se u na akhawunti?",
  "Ni no vha na akhaunte?",
  "Usuvele unayo li-akhawunti?",
);
lex(
  "or continue with",
  "ou continuar com",
  "o continuar con",
  "of gaan voort met",
  "noma qhubeka nge",
  "okanye qhubeka nge",
  "kapa tsoela pele ka",
  "goba tšwela pele ka",
  "kgotsa tswelela ka",
  "kumbe yisa emahlweni hi",
  "kana bvela phanḓa nga",
  "noma chubeka nge",
);
lex(
  "Remember me for 30 days",
  "Lembrar-me durante 30 dias",
  "Recuérdame durante 30 días",
  "Onthou my vir 30 dae",
  "Ngikhumbule izinsuku ezingu-30",
  "Ndikhumbule iintsuku ezingama-30",
  "Nkhopole matsatsi a 30",
  "Nkgopole matšatši a 30",
  "Nkgopole malatsi a 30",
  "Ndzi tsundzuka masiku ya 30",
  "Ndi ndi humbule maḓuvha a 30",
  "Ngikhumbule emalanga langu-30",
);
lex(
  "By continuing, you agree to our Terms of Service and Privacy Policy",
  "Ao continuar, concorda com os nossos Termos de Serviço e a Política de Privacidade",
  "Al continuar, aceptas nuestros Términos del servicio y la Política de privacidad",
  "Deur voort te gaan, stem jy in tot ons Diensbepalings en Privaatheidsbeleid",
  "Ngokuqhubeka, uyavuma Imigomo Yesevisi kanye Nenqubomgomo Yobumfihlo",
  "Ngokuqhubeka, uyavuma Imiqathango Yenkonzo kunye Nomgaqo-nkqubo Wabucala",
  "Ka ho tsoela pele, u lumela Melao ea Tšebeletso le Leano la Lekunutu",
  "Ka go tšwela pele, o dumela Melao ya Tirelo le Pholisi ya Sephiri",
  "Ka go tswelela, o dumela Melao ya Tirelo le Pholisi ya Sephiri",
  "Hi ku yisa emahlweni, wa pfumela Milawu ya Vukorhokeri na Pholisi ya Xihundla",
  "Nga u bvela phanḓa, ni khou tenda Milayo ya Tshumelo na Pholisi ya Tshidzumbe",
  "Ngekuchubeka, uyavuma Imigomo Yensevisi kanye Nenqubomgomo Yekufihla",
);
lex("minutes", "minutos", "minutos", "minute", "imizuzu", "imizuzu", "metsotso", "metsotso", "metsotso", "timinete", "minitsi", "emaminithi");
lex("minute", "minuto", "minuto", "minuut", "umzuzu", "umzuzu", "motsotso", "motsotso", "motsotso", "minete", "miniti", "umzuzu");
lex("Email", "E-mail", "Correo", "E-pos", "I-imeyili", "I-imeyile", "Imeile", "Imeile", "Imeile", "Imeyili", "Imeili", "I-imeyili");
lex(
  "Country or region",
  "País ou região",
  "País o región",
  "Land of streek",
  "Izwe noma isifunda",
  "Ilizwe okanye ingingqi",
  "Naha kapa sebaka",
  "Naga goba selete",
  "Naga kgotsa kgaolo",
  "Tiko kumbe xifundza",
  "Shango kana tshiṱiriki",
  "Live noma sifundza",
);
lex(
  "Country code",
  "Indicativo",
  "Código de país",
  "Landkode",
  "Ikhodi yezwe",
  "Ikhowudi yelizwe",
  "Khoutu ea naha",
  "Khoutu ya naga",
  "Khoutu ya naga",
  "Khodi ya tiko",
  "Khoudu ya shango",
  "Ikhodi yelve",
);
lex(
  "Search countries or codes…",
  "Pesquisar países ou códigos…",
  "Buscar países o códigos…",
  "Soek lande of kodes…",
  "Sesha amazwe noma amakhodi…",
  "Khangela amazwe okanye iikhowudi…",
  "Batla linaha kapa likhoutu…",
  "Nyaka dinaga goba dikhoutu…",
  "Batla dinaga kgotsa dikhoutu…",
  "Lavisisa matiko kumbe tikhodi…",
  "Ṱoḓa mashango kana khoudu…",
  "Sesha emave noma emakhodi…",
);
lex(
  "Search countries",
  "Pesquisar países",
  "Buscar países",
  "Soek lande",
  "Sesha amazwe",
  "Khangela amazwe",
  "Batla linaha",
  "Nyaka dinaga",
  "Batla dinaga",
  "Lavisisa matiko",
  "Ṱoḓa mashango",
  "Sesha emave",
);
lex(
  "Number looks valid.",
  "O número parece válido.",
  "El número parece válido.",
  "Nommer lyk geldig.",
  "Inombolo ibukeka ivumelekile.",
  "Inombolo ibonakala isebenza.",
  "Nomoro e bonahala e nepahetse.",
  "Nomoro e bonala e nepagetše.",
  "Nomoro e lebega e siame.",
  "Nomboro yi languteka yi lulamele.",
  "Nombolo i tshi khou vhonala yo tea.",
  "Inombolo ibukeka ivumelekile.",
);
lex(
  "Wedding/Event",
  "Casamento/Evento",
  "Boda/Evento",
  "Troue/Geleentheid",
  "Umcimbi womshado",
  "Umtshato/Umsitho",
  "Lenyalo/Ketsahalo",
  "Lenyalo/Tiragalo",
  "Lenyalo/Tiragalo",
  "Ncwato/Nkhuvo",
  "Mbingano/Tshigwada",
  "Umcimbi wemshado",
);
lex("Special Occasion", "Ocasião especial", "Ocasión especial", "Spesiale geleentheid", "Umcimbi okhethekile", "Umsitho okhethekileyo", "Ketsahalo e khethehileng", "Tiragalo ye kgethegilego", "Tiragalo e e kgethegileng", "Nkhuvo yo hlawuleka", "Tshigwada tsho khetheaho", "Umcimbi lokhethekile");
lex("Package Deal", "Pacote", "Paquete", "Pakketaanbod", "Iphakheji", "Iphakheji", "Sephuthelo", "Sephuthelo", "Sephuthelo", "Xipakeji", "Phakethe", "Liphakheji");
lex("Group Booking", "Marcação de grupo", "Reserva grupal", "Groepbespreking", "Ukubhuka kweqembu", "Ukubhukisha kweqela", "Buking ya sehlopha", "Bukingo ya sehlopha", "Bukingo ya setlhopha", "Ku buka ka ntlawa", "U buka ha tshigwada", "Kubhuka kwelitimba");
lex("View {{name}}, {{rating}}, {{reviews}}", "Ver {{name}}, {{rating}}, {{reviews}}", "Ver {{name}}, {{rating}}, {{reviews}}", "Sien {{name}}, {{rating}}, {{reviews}}", "Buka {{name}}, {{rating}}, {{reviews}}", "Jonga {{name}}, {{rating}}, {{reviews}}", "Sheba {{name}}, {{rating}}, {{reviews}}", "Bona {{name}}, {{rating}}, {{reviews}}", "Bona {{name}}, {{rating}}, {{reviews}}", "Vona {{name}}, {{rating}}, {{reviews}}", "Vhona {{name}}, {{rating}}, {{reviews}}", "Buka {{name}}, {{rating}}, {{reviews}}");
lex("{{name}} listing photo", "Foto do anúncio de {{name}}", "Foto del anuncio de {{name}}", "{{name}} se lysfoto", "Isithombe sokufakwa kuka-{{name}}", "Ifoto yokufakwa kuka-{{name}}", "Foto ea lenane la {{name}}", "Senepe sa lenaneo la {{name}}", "Setshwantsho sa lenaane la {{name}}", "Xifaniso xa nxaxamelo wa {{name}}", "Tshifanyiso tsha mutevhe wa {{name}}", "Sitfombe seluhlu lwa {{name}}");
lex("Rating: {{rating}}, {{reviews}}", "Classificação: {{rating}}, {{reviews}}", "Valoración: {{rating}}, {{reviews}}", "Gradering: {{rating}}, {{reviews}}", "Isilinganiso: {{rating}}, {{reviews}}", "Ulinganiso: {{rating}}, {{reviews}}", "Kemo: {{rating}}, {{reviews}}", "Tekanyo: {{rating}}, {{reviews}}", "Tekanyo: {{rating}}, {{reviews}}", "Mpimo: {{rating}}, {{reviews}}", "Linganyiso: {{rating}}, {{reviews}}", "Linganiso: {{rating}}, {{reviews}}");
lex("{{km}} km away", "{{km}} km de distância", "A {{km}} km", "{{km}} km weg", "Kumakhilomitha angu-{{km}}", "Kwiikhilomitha ezi-{{km}}", "Lik'hilomithara tse {{km}}", "Dikhilomithara tše {{km}}", "Dikhilomithara tse {{km}}", "Tikhilomithara ta {{km}}", "Khilomitha dza {{km}}", "Emakhilomitha langu-{{km}}");
lex("Afro", "Afro", "Afro", "Afro", "Afro", "Afro", "Afro", "Afro", "Afro", "Afro", "Afro", "Afro");

const FRARSW_EXACT = {
  "Don't have an account?": { fr: "Vous n’avez pas de compte ?", ar: "ليس لديك حساب؟", sw: "Huna akaunti?" },
  "Continue with Google": { fr: "Continuer avec Google", ar: "المتابعة باستخدام Google", sw: "Endelea na Google" },
  "Continue with Apple": { fr: "Continuer avec Apple", ar: "المتابعة باستخدام Apple", sw: "Endelea na Apple" },
  "Sign up": { fr: "S’inscrire", ar: "إنشاء حساب", sw: "Jisajili" },
  "Log in": { fr: "Se connecter", ar: "تسجيل الدخول", sw: "Ingia" },
  "Log out": { fr: "Se déconnecter", ar: "تسجيل الخروج", sw: "Toka" },
  Email: { fr: "E-mail", ar: "البريد الإلكتروني", sw: "Barua pepe" },
  "Forgot password?": { fr: "Mot de passe oublié ?", ar: "نسيت كلمة المرور؟", sw: "Umesahau nenosiri?" },
  "Already have an account?": { fr: "Vous avez déjà un compte ?", ar: "لديك حساب بالفعل؟", sw: "Una akaunti tayari?" },
  "or continue with": { fr: "ou continuer avec", ar: "أو المتابعة باستخدام", sw: "au endelea na" },
  "Remember me for 30 days": { fr: "Se souvenir de moi pendant 30 jours", ar: "تذكرني لمدة 30 يوماً", sw: "Nikumbuke kwa siku 30" },
  minutes: { fr: "minutes", ar: "دقائق", sw: "dakika" },
  minute: { fr: "minute", ar: "دقيقة", sw: "dakika" },
  "Country or region": { fr: "Pays ou région", ar: "البلد أو المنطقة", sw: "Nchi au eneo" },
  "Country code": { fr: "Indicatif", ar: "رمز الدولة", sw: "Msimbo wa nchi" },
  "Search countries or codes…": { fr: "Rechercher des pays ou des codes…", ar: "ابحث عن بلدان أو رموز…", sw: "Tafuta nchi au misimbo…" },
  "Search countries": { fr: "Rechercher des pays", ar: "ابحث عن بلدان", sw: "Tafuta nchi" },
  "Number looks valid.": { fr: "Le numéro semble valide.", ar: "يبدو الرقم صالحاً.", sw: "Nambari inaonekana sahihi." },
  "Wedding/Event": { fr: "Mariage/Événement", ar: "زفاف/مناسبة", sw: "Harusi/Tukio" },
  "Special Occasion": { fr: "Occasion spéciale", ar: "مناسبة خاصة", sw: "Tukio maalum" },
  "Package Deal": { fr: "Forfait", ar: "باقة", sw: "Kifurushi" },
  "Group Booking": { fr: "Réservation de groupe", ar: "حجز جماعي", sw: "Uhifadhi wa kikundi" },
  "View {{name}}, {{rating}}, {{reviews}}": {
    fr: "Voir {{name}}, {{rating}}, {{reviews}}",
    ar: "عرض {{name}}، {{rating}}، {{reviews}}",
    sw: "Tazama {{name}}, {{rating}}, {{reviews}}",
  },
  "{{name}} listing photo": {
    fr: "Photo de l’annonce de {{name}}",
    ar: "صورة قائمة {{name}}",
    sw: "Picha ya tangazo la {{name}}",
  },
  "Rating: {{rating}}, {{reviews}}": {
    fr: "Note : {{rating}}, {{reviews}}",
    ar: "التقييم: {{rating}}، {{reviews}}",
    sw: "Kiwango: {{rating}}, {{reviews}}",
  },
  "{{km}} km away": { fr: "À {{km}} km", ar: "على بعد {{km}} كم", sw: "Km {{km}} kutoka hapa" },
};

const BROKEN = [
  /looks /i,
  /Soek countries/i,
  /land or region/i,
  /Don't have an rekening/i,
  /Continue with Google/i,
  /Continue with Apple/i,
  /Don't have an account\?/i,
  /Phone number$/i,
  /^Sign up$/i,
  /^Email$/i,
  /^minutes$/i,
  /^Country or region$/i,
];

function flatten(obj, prefix = "", out = new Map()) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, full, out);
    else if (typeof v === "string") out.set(full, v);
  }
  return out;
}

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

function deepMerge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return source;
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target?.[k] && typeof target[k] === "object") {
      out[k] = deepMerge(target[k], v);
    } else out[k] = v;
  }
  return out;
}

function inPrefix(key) {
  return PREFIXES.some((p) => key === p || key.startsWith(`${p}.`));
}

function shouldReplace(enVal, locVal) {
  if (locVal === enVal) return true;
  return BROKEN.some((re) => re.test(locVal));
}

function lookupLocal(en, locale) {
  if (LOCAL.has(en) && LOCAL.get(en)[locale]) return LOCAL.get(en)[locale];
  const lower = en.toLowerCase();
  for (const [k, row] of LOCAL) {
    if (k.toLowerCase() === lower && row[locale]) return row[locale];
  }
  return null;
}

function translateFor(en, locale) {
  if (WAVE.includes(locale)) {
    const local = lookupLocal(en, locale);
    if (local) return local;
    return translateWaveA(en, locale);
  }
  if (FRARSW.includes(locale)) {
    if (FRARSW_EXACT[en]?.[locale]) return FRARSW_EXACT[en][locale];
    return translateFrArSw(en, locale);
  }
  return en;
}

const EN_DELTA = JSON.parse(fs.readFileSync(new URL("./leftover-en-delta2.json", import.meta.url)));
const enPath = path.join(localesDir, "en.json");
const en = deepMerge(JSON.parse(fs.readFileSync(enPath, "utf8")), EN_DELTA);
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n");
const enFlat = flatten(en);

for (const code of ["en-US", "en-GB", "en-AU"]) {
  const p = path.join(localesDir, `${code}.json`);
  if (!fs.existsSync(p)) continue;
  fs.writeFileSync(p, JSON.stringify(deepMerge(JSON.parse(fs.readFileSync(p, "utf8")), EN_DELTA), null, 2) + "\n");
}

const report = {};
for (const locale of ALL) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = deepMerge(JSON.parse(fs.readFileSync(localePath, "utf8")), EN_DELTA);
  const locFlat = flatten(data);
  let mapped = 0;
  let skipped = 0;
  for (const [key, enVal] of enFlat) {
    if (!inPrefix(key)) continue;
    const locVal = locFlat.get(key);
    if (typeof locVal !== "string") continue;
    if (!shouldReplace(enVal, locVal)) continue;
    const out = translateFor(enVal, locale);
    if (!out || out === enVal) {
      skipped += 1;
      continue;
    }
    if (WAVE.includes(locale) && stillMostlyEnglish(enVal, out) && !lookupLocal(enVal, locale)) {
      skipped += 1;
      continue;
    }
    deepSet(data, key, out);
    mapped += 1;
  }
  const payload = JSON.stringify(data, null, 2) + "\n";
  const tmp = `${localePath}.tmp`;
  let lastErr;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.writeFileSync(tmp, payload);
      fs.renameSync(tmp, localePath);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      const until = Date.now() + 500 * (attempt + 1);
      while (Date.now() < until) {
        /* wait for file lock */
      }
    }
  }
  if (lastErr) throw lastErr;
  report[locale] = { mapped, skipped };
  console.log(locale, "mapped", mapped, "skipped", skipped);
}

for (const [alias, src] of Object.entries(ALIASES)) {
  const aliasPath = path.join(localesDir, `${alias}.json`);
  if (!fs.existsSync(aliasPath)) continue;
  const data = deepMerge(JSON.parse(fs.readFileSync(aliasPath, "utf8")), EN_DELTA);
  const srcData = JSON.parse(fs.readFileSync(path.join(localesDir, `${src}.json`), "utf8"));
  const srcFlat = flatten(srcData);
  for (const [key] of enFlat) {
    if (!inPrefix(key)) continue;
    if (srcFlat.has(key)) deepSet(data, key, srcFlat.get(key));
  }
  fs.writeFileSync(aliasPath, JSON.stringify(data, null, 2) + "\n");
  console.log("updated", alias, "from", src);
}

console.log(JSON.stringify(report, null, 2));
