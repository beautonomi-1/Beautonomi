#!/usr/bin/env node
/** Force-overwrite leftover login-modal chrome for Wave A (14 langs). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const WAVE = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "fr", "ar", "sw", "pt", "es"];
const ALIASES = { "pt-BR": "pt", "es-MX": "es" };

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

function writeLocale(localePath, data) {
  const payload = JSON.stringify(data, null, 2) + "\n";
  const tmp = `${localePath}.tmp`;
  fs.writeFileSync(tmp, payload);
  fs.renameSync(tmp, localePath);
}

const KEYS = {
  "web.global.loginModal.continueWithPhone": [
    "Gaan voort met foon",
    "Qhubeka ngocingo",
    "Qhubeka ngefowuni",
    "Tsoela pele ka mohala",
    "Tšwela pele ka mogala",
    "Tswelela ka mogala",
    "Yisa emahlweni hi riqingho",
    "Bvela phanḓa nga luṱingoni",
    "Chubeka ngelucingo",
    "Continuer avec le téléphone",
    "المتابعة بالهاتف",
    "Endelea na simu",
    "Continuar com o telemóvel",
    "Continuar con el teléfono",
  ],
  "web.global.loginModal.continueWithEmail": [
    "Gaan voort met e-pos",
    "Qhubeka nge-imeyili",
    "Qhubeka nge-imeyile",
    "Tsoela pele ka imeile",
    "Tšwela pele ka imeile",
    "Tswelela ka imeile",
    "Yisa emahlweni hi imeyili",
    "Bvela phanḓa nga imeili",
    "Chubeka nge-imeyili",
    "Continuer avec l’e-mail",
    "المتابعة بالبريد",
    "Endelea na barua pepe",
    "Continuar com o e-mail",
    "Continuar con el correo",
  ],
  "web.global.loginModal.signInSubtitle": [
    "Meld aan of registreer om voort te gaan — ons stel jou op wanneer jy verifieer.",
    "Ngena noma bhalisa ukuze uqhubeke — sizokusetha uma uqinisekisa.",
    "Ngena okanye bhalisa ukuze uqhubeke — siza kukulungisa xa uqinisekisa.",
    "Kena kapa ngolisa ho tsoela pele — re tla u hlophisa ha u netefatsa.",
    "Tsena goba ngwadiša go tšwela pele — re tla go beakanya ge o netefatša.",
    "Tsena kgotsa nwadisa go tswelela — re tla go baakanya fa o netefatsa.",
    "Nghena kumbe tsarisa ku yisa emahlweni — hi ta ku lunghisa loko u tiyisisa.",
    "Nngena kana ṅwalisa u bvela phanḓa — ri ḓo ni lulamisela musi ni tshi khwaṱhisedza.",
    "Ngena noma bhalisa kute uchubeke — sitakwenteka nawucinisekisa.",
    "Connectez-vous ou inscrivez-vous pour continuer — nous vous installerons après vérification.",
    "سجّل الدخول أو أنشئ حساباً للمتابعة — سنجهّز حسابك بعد التحقق.",
    "Ingia au jisajili ili uendelee — tutakuweka baada ya kuthibitisha.",
    "Inicie sessão ou registe-se para continuar — configuramos a conta após verificar.",
    "Inicia sesión o regístrate para continuar — te configuramos al verificar.",
  ],
  "web.global.loginModal.signUpSubtitle": [
    "Skep 'n rekening om skoonheidsdienste naby jou te bespreek.",
    "Dala i-akhawunti ukuze ubhuke izinsiza zobuhle eduze kwakho.",
    "Yila iakhawunti ukuze ubhukishe iinkonzo zobuhle kufutshane nawe.",
    "Theha akhaonto ho booka litšebeletso tsa botle haufi le uena.",
    "Hlama akhauute go puka ditirelo tša bontle kgauswi le wena.",
    "Tlhola akhauunte go buka ditirelo tsa bontle gaufi le wena.",
    "Tumbuluxa akhawunti ku buka vukorhokeri bya vuswikoti ekusuhi na wena.",
    "Vumba akhaunte u buka tshumelo dza vhudele tsini na inwi.",
    "Yakha li-akhawunti kute ubhuke tinsita tebuhle eduze kwakho.",
    "Créez un compte pour réserver des services beauté près de chez vous.",
    "أنشئ حساباً لحجز خدمات التجميل بالقرب منك.",
    "Unda akaunti ili uhifadhi huduma za urembo karibu nawe.",
    "Crie uma conta para marcar serviços de beleza perto de si.",
    "Crea una cuenta para reservar servicios de belleza cerca de ti.",
  ],
  "web.global.loginModal.usePasswordInstead": [
    "Gebruik eerder 'n wagwoord",
    "Sebenzisa iphasiwedi esikhundleni",
    "Sebenzisa iphasiwedi endaweni yoko",
    "Sebelisa phasewete ho e-na",
    "Šomiša phasewete e lego gona",
    "Dirisa phasewete mo boemong",
    "Tirhisa phasiwedi",
    "Shumisa phasiwede",
    "Sebentisa liphaswedi",
    "Utiliser un mot de passe",
    "استخدم كلمة المرور بدلاً من ذلك",
    "Tumia nenosiri badala yake",
    "Usar palavra-passe",
    "Usar contraseña",
  ],
  "web.global.loginModal.signingIn": [
    "Meld tans aan…",
    "Iyangenisa…",
    "Iyangenisa…",
    "E a kena…",
    "E a tsena…",
    "E a tsena…",
    "Yi nghenisa…",
    "I khou nngena…",
    "Iyangenisa…",
    "Connexion…",
    "جارٍ تسجيل الدخول…",
    "Inaingia…",
    "A iniciar sessão…",
    "Iniciando sesión…",
  ],
  "web.global.loginModal.or": [
    "of",
    "noma",
    "okanye",
    "kapa",
    "goba",
    "kgotsa",
    "kumbe",
    "kana",
    "noma",
    "ou",
    "أو",
    "au",
    "ou",
    "o",
  ],
  "web.global.loginModal.instead": [
    "in plaas daarvan",
    "esikhundleni",
    "endaweni yoko",
    "ho e-na",
    "sebakeng sa",
    "mo boemong",
    "endzhaku ka",
    "fhethu ha",
    "esikhundleni",
    "à la place",
    "بدلاً من ذلك",
    "badala yake",
    "em vez disso",
    "en su lugar",
  ],
  "web.global.loginModal.needHelp": [
    "Hulp nodig?",
    "Udinga usizo?",
    "Udinga uncedo?",
    "U hloka thuso?",
    "O nyaka thušo?",
    "O tlhoka thuso?",
    "U lava mpfuno?",
    "Ni ṱoḓa thuso?",
    "Udzinga lusito?",
    "Besoin d’aide ?",
    "هل تحتاج مساعدة؟",
    "Unahitaji usaidizi?",
    "Precisa de ajuda?",
    "¿Necesitas ayuda?",
  ],
  "web.global.loginModal.creatingAccount": [
    "Skep tans rekening…",
    "Idala i-akhawunti…",
    "Iyila iakhawunti…",
    "E theha akhaonto…",
    "E hlama akhauute…",
    "E tlhola akhauunte…",
    "Yi tumbuluxa akhawunti…",
    "I khou vumba akhaunte…",
    "Iyakha li-akhawunti…",
    "Création du compte…",
    "جارٍ إنشاء الحساب…",
    "Inaunda akaunti…",
    "A criar a conta…",
    "Creando la cuenta…",
  ],
  "web.global.loginModal.emailCodeInstead": [
    "e-poskode",
    "ikhodi ye-imeyili",
    "ikhowudi ye-imeyile",
    "khoutu ea imeile",
    "khoutu ya imeile",
    "khoutu ya imeile",
    "khodi ya imeyili",
    "khoudu ya imeili",
    "ikhodi ye-imeyili",
    "code e-mail",
    "رمز البريد",
    "nambari ya barua pepe",
    "código de e-mail",
    "código de correo",
  ],
  "web.global.loginModal.resetIt": [
    "Stel dit terug",
    "Yi setha kabusha",
    "Yisete kwakhona",
    "E behe bocha",
    "E bee leswa",
    "E baya sesha",
    "Yi veka leswi",
    "I vhee ntswa",
    "Yisethe kabusha",
    "Réinitialisez-le",
    "أعد تعيينها",
    "Iweke upya",
    "Redefini-la",
    "Restablécela",
  ],
  "web.global.loginModal.ifNotVerifiedYet": [
    "As jy jou e-pos nog nie geverifieer het nie:",
    "Uma ungakaqinisekisi i-imeyili yakho:",
    "Ukuba awukaqinisekisa i-imeyile yakho:",
    "Haeba u e-so netefatse imeile ea hau:",
    "Ge o sa netefatše imeile ya gago:",
    "Fa o sa netefatsa imeile ya gago:",
    "Loko u nga si tiyisisa imeyili ya wena:",
    "Arali ni songo khwaṱhisedza imeili yaṋu:",
    "Uma ungakacinisekisi i-imeyili yakho:",
    "Si vous n’avez pas encore vérifié votre e-mail :",
    "إذا لم تتحقق من بريدك بعد:",
    "Ikiwa bado hujathibitisha barua pepe yako:",
    "Se ainda não verificou o e-mail:",
    "Si aún no has verificado tu correo:",
  ],
  "web.global.loginModal.sending": [
    "Stuur tans…",
    "Iyathumela…",
    "Ithumela…",
    "E a romela…",
    "E a romela…",
    "E a romela…",
    "Yi rhumela…",
    "I khou rumela…",
    "Itfumela…",
    "Envoi…",
    "جارٍ الإرسال…",
    "Inatuma…",
    "A enviar…",
    "Enviando…",
  ],
  "web.global.phoneInput.countryCode": [
    "Landkode",
    "Ikhodi yezwe",
    "Ikhowudi yelizwe",
    "Khoutu ea naha",
    "Khoutu ya naga",
    "Khoutu ya naga",
    "Khodi ya tiko",
    "Khoudu ya shango",
    "Ikhodi yelve",
    "Indicatif",
    "رمز الدولة",
    "Msimbo wa nchi",
    "Indicativo",
    "Código de país",
  ],
};

for (const [key, vals] of Object.entries(KEYS)) {
  if (vals.length !== 14) throw new Error(`${key} has ${vals.length}`);
}

for (const locale of WAVE) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  const idx = WAVE.indexOf(locale);
  for (const [key, vals] of Object.entries(KEYS)) deepSet(data, key, vals[idx]);
  writeLocale(localePath, data);
  console.log("updated", locale);
}

for (const [alias, src] of Object.entries(ALIASES)) {
  const aliasPath = path.join(localesDir, `${alias}.json`);
  if (!fs.existsSync(aliasPath)) continue;
  const data = JSON.parse(fs.readFileSync(aliasPath, "utf8"));
  const idx = WAVE.indexOf(src);
  for (const [key, vals] of Object.entries(KEYS)) deepSet(data, key, vals[idx]);
  writeLocale(aliasPath, data);
  console.log("updated", alias);
}
