#!/usr/bin/env node
/**
 * Extra locales leftover keys (de hi it nl tr id am rw). Locale-keyed to avoid array-length bugs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const EXTRA = ["de", "hi", "it", "nl", "tr", "id", "am", "rw"];

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

const EN_DELTA = JSON.parse(fs.readFileSync(new URL("./leftover-en-delta2.json", import.meta.url)));

/** dotted key → { de, hi, it, nl, tr, id, am, rw } */
const KEYS = {
  "customer.mobile.screens.partnerProfile.tagHouseCalls": {
    de: "Hausbesuche",
    hi: "घर पर सेवा",
    it: "A domicilio",
    nl: "Aan huis",
    tr: "Ev ziyareti",
    id: "Kunjungan rumah",
    am: "የቤት ጉብኝት",
    rw: "Gusura mu rugo",
  },
  "web.layout.bottomNav.bookings": {
    de: "Buchungen",
    hi: "बुकिंग",
    it: "Prenotazioni",
    nl: "Boekingen",
    tr: "Rezervasyonlar",
    id: "Pemesanan",
    am: "ቦታ ማስያዣዎች",
    rw: "Amareservasiyo",
  },
  "web.layout.bottomNav.wishlists": {
    de: "Wunschlisten",
    hi: "विशलिस्ट",
    it: "Liste dei desideri",
    nl: "Verlanglijsten",
    tr: "İstek listeleri",
    id: "Daftar keinginan",
    am: "የምኞት ዝርዝሮች",
    rw: "Urutonde rw'ibyifuzo",
  },
  "web.login.useDifferentNumber": {
    de: "Andere Nummer verwenden",
    hi: "दूसरा नंबर इस्तेमाल करें",
    it: "Usa un altro numero",
    nl: "Ander nummer gebruiken",
    tr: "Farklı numara kullan",
    id: "Gunakan nomor lain",
    am: "ሌላ ቁጥር ይጠቀሙ",
    rw: "Koresha nimero indimi",
  },
  "web.login.useDifferentEmail": {
    de: "Andere E-Mail verwenden",
    hi: "दूसरा ईमेल इस्तेमाल करें",
    it: "Usa un altro indirizzo email",
    nl: "Ander e-mail gebruiken",
    tr: "Farklı e-posta kullan",
    id: "Gunakan email lain",
    am: "ሌላ ኢሜይል ይጠቀሙ",
    rw: "Koresha imeri indimi",
  },
  "web.login.legalBefore": {
    de: "Wenn du fortfährst, stimmst du unseren",
    hi: "जारी रखकर आप हमारी",
    it: "Continuando, accetti i nostri",
    nl: "Door verder te gaan, ga je akkoord met onze",
    tr: "Devam ederek şunları kabul edersiniz:",
    id: "Dengan melanjutkan, Anda menyetujui",
    am: "በመቀጠልዎ፣ የእኛን",
    rw: "Ukomereza, wemera",
  },
  "web.login.legalPrivacy": {
    de: "Datenschutzrichtlinie",
    hi: "गोपनीयता नीति",
    it: "Informativa sulla privacy",
    nl: "Privacybeleid",
    tr: "Gizlilik Politikası",
    id: "Kebijakan Privasi",
    am: "የግላዊነት ፖሊሲ",
    rw: "Politiki y'ubuzima bwite",
  },
  "web.login.errors.validPhoneWithCountry": {
    de: "Bitte eine gültige Nummer mit Ländercode eingeben (z. B. +27 82 345 6789).",
    hi: "देश कोड के साथ मान्य फ़ोन नंबर दर्ज करें (जैसे +27 82 345 6789)।",
    it: "Inserisci un numero valido con prefisso (es. +27 82 345 6789).",
    nl: "Voer een geldig nummer met landcode in (bijv. +27 82 345 6789).",
    tr: "Ülke koduyla geçerli bir numara girin (ör. +27 82 345 6789).",
    id: "Masukkan nomor valid dengan kode negara (mis. +27 82 345 6789).",
    am: "ከአገር ኮድ ጋር ትክክለኛ ስልክ ያስገቡ (ምሳ. +27 82 345 6789)።",
    rw: "Andika nimero yemewe ifite kode y'igihugu (ur. +27 82 345 6789).",
  },
  "web.login.codeSentValidMin": {
    de: "Code gesendet. Gültig ca. {{minutes}} Min.",
    hi: "कोड भेजा गया। लगभग {{minutes}} मिनट मान्य।",
    it: "Codice inviato. Valido circa {{minutes}} min.",
    nl: "Code verzonden. Ong. {{minutes}} min geldig.",
    tr: "Kod gönderildi. Yaklaşık {{minutes}} dk geçerli.",
    id: "Kode terkirim. Berlaku sekitar {{minutes}} mnt.",
    am: "ኮድ ተልኳል። ለ{{minutes}} ደቂቃ ያህል ይሰራል።",
    rw: "Kode yoherejwe. Ikoreshwa hafi iminota {{minutes}}.",
  },
  "web.login.newCodeSent": {
    de: "Ein neuer Bestätigungscode wurde gesendet.",
    hi: "नया सत्यापन कोड भेजा गया है।",
    it: "È stato inviato un nuovo codice di verifica.",
    nl: "Er is een nieuwe verificatiecode verzonden.",
    tr: "Yeni bir doğrulama kodu gönderildi.",
    id: "Kode verifikasi baru telah dikirim.",
    am: "አዲስ የማረጋገጫ ኮድ ተልኳል።",
    rw: "Kode nshya yo kwemeza yoherejwe.",
  },
  "auth.dontHaveAccount": {
    de: "Noch kein Konto?",
    hi: "खाता नहीं है?",
    it: "Non hai un account?",
    nl: "Nog geen account?",
    tr: "Hesabın yok mu?",
    id: "Belum punya akun?",
    am: "መለያ የለዎትም?",
    rw: "Ntufite konti?",
  },
  "auth.continueWithGoogle": {
    de: "Mit Google fortfahren",
    hi: "Google से जारी रखें",
    it: "Continua con Google",
    nl: "Doorgaan met Google",
    tr: "Google ile devam et",
    id: "Lanjutkan dengan Google",
    am: "በGoogle ቀጥል",
    rw: "Komeza na Google",
  },
  "auth.continueWithApple": {
    de: "Mit Apple fortfahren",
    hi: "Apple से जारी रखें",
    it: "Continua con Apple",
    nl: "Doorgaan met Apple",
    tr: "Apple ile devam et",
    id: "Lanjutkan dengan Apple",
    am: "በApple ቀጥል",
    rw: "Komeza na Apple",
  },
  "auth.signup": {
    de: "Registrieren",
    hi: "साइन अप करें",
    it: "Registrati",
    nl: "Registreren",
    tr: "Kaydol",
    id: "Daftar",
    am: "ተመዝገብ",
    rw: "Iyandikishe",
  },
  "auth.email": {
    de: "E-Mail",
    hi: "ईमेल",
    it: "Email",
    nl: "E-mail",
    tr: "E-posta",
    id: "Email",
    am: "ኢሜይል",
    rw: "Imeri",
  },
  "auth.phone": {
    de: "Telefonnummer",
    hi: "फ़ोन नंबर",
    it: "Numero di telefono",
    nl: "Telefoonnummer",
    tr: "Telefon numarası",
    id: "Nomor telepon",
    am: "ስልክ ቁጥር",
    rw: "Nimero ya telefoni",
  },
  "auth.login": {
    de: "Anmelden",
    hi: "लॉग इन",
    it: "Accedi",
    nl: "Inloggen",
    tr: "Giriş yap",
    id: "Masuk",
    am: "ግባ",
    rw: "Injira",
  },
  "common.close": {
    de: "Schließen",
    hi: "बंद करें",
    it: "Chiudi",
    nl: "Sluiten",
    tr: "Kapat",
    id: "Tutup",
    am: "ዝጋ",
    rw: "Funga",
  },
  "web.global.loginModal.emailTab": {
    de: "E-Mail",
    hi: "ईमेल",
    it: "Email",
    nl: "E-mail",
    tr: "E-posta",
    id: "Email",
    am: "ኢሜይል",
    rw: "Imeri",
  },
  "web.global.loginModal.minutes": {
    de: "Minuten",
    hi: "मिनट",
    it: "minuti",
    nl: "minuten",
    tr: "dakika",
    id: "menit",
    am: "ደቂቃዎች",
    rw: "iminota",
  },
  "web.global.phoneInput.countryOrRegionA11y": {
    de: "Land oder Region",
    hi: "देश या क्षेत्र",
    it: "Paese o regione",
    nl: "Land of regio",
    tr: "Ülke veya bölge",
    id: "Negara atau wilayah",
    am: "አገር ወይም ክልል",
    rw: "Igihugu cyangwa akarere",
  },
  "web.global.phoneInput.countryCode": {
    de: "Ländercode",
    hi: "देश कोड",
    it: "Prefisso",
    nl: "Landcode",
    tr: "Ülke kodu",
    id: "Kode negara",
    am: "የአገር ኮድ",
    rw: "Kode y'igihugu",
  },
  "web.global.phoneInput.searchPlaceholder": {
    de: "Länder oder Codes suchen…",
    hi: "देश या कोड खोजें…",
    it: "Cerca paesi o prefissi…",
    nl: "Zoek landen of codes…",
    tr: "Ülke veya kod ara…",
    id: "Cari negara atau kode…",
    am: "አገሮች ወይም ኮዶች ፈልግ…",
    rw: "Shakisha ibihugu cyangwa kode…",
  },
  "web.cards.viewListingA11y": {
    de: "{{name}} ansehen, {{rating}}, {{reviews}}",
    hi: "{{name}} देखें, {{rating}}, {{reviews}}",
    it: "Vedi {{name}}, {{rating}}, {{reviews}}",
    nl: "Bekijk {{name}}, {{rating}}, {{reviews}}",
    tr: "{{name}} görüntüle, {{rating}}, {{reviews}}",
    id: "Lihat {{name}}, {{rating}}, {{reviews}}",
    am: "{{name}} ይመልከቱ፣ {{rating}}፣ {{reviews}}",
    rw: "Reba {{name}}, {{rating}}, {{reviews}}",
  },
  "web.cards.listingPhotoA11y": {
    de: "Anzeigenfoto von {{name}}",
    hi: "{{name}} की लिस्टिंग फ़ोटो",
    it: "Foto dell’annuncio di {{name}}",
    nl: "Advertentiefoto van {{name}}",
    tr: "{{name}} ilan fotoğrafı",
    id: "Foto listing {{name}}",
    am: "የ{{name}} ዝርዝር ፎቶ",
    rw: "Ifoto y'urutonde rwa {{name}}",
  },
  "web.cards.ratingA11y": {
    de: "Bewertung: {{rating}}, {{reviews}}",
    hi: "रेटिंग: {{rating}}, {{reviews}}",
    it: "Valutazione: {{rating}}, {{reviews}}",
    nl: "Beoordeling: {{rating}}, {{reviews}}",
    tr: "Puan: {{rating}}, {{reviews}}",
    id: "Peringkat: {{rating}}, {{reviews}}",
    rw: "Amanota: {{rating}}, {{reviews}}",
    am: "ደረጃ: {{rating}}፣ {{reviews}}",
  },
  "web.cards.kmAway": {
    de: "{{km}} km entfernt",
    hi: "{{km}} किमी दूर",
    it: "A {{km}} km",
    nl: "{{km}} km verderop",
    tr: "{{km}} km uzakta",
    id: "{{km}} km jauhnya",
    am: "{{km}} ኪሜ ርቀት",
    rw: "Km {{km}} kure",
  },
  "web.categories.afro": {
    de: "Afro",
    hi: "अफ्रो",
    it: "Afro",
    nl: "Afro",
    tr: "Afro",
    id: "Afro",
    am: "አፍሮ",
    rw: "Afro",
  },
  "customer.mobile.screens.partnerProfile.customTplWedding": {
    de: "Hochzeit/Event",
    hi: "शादी/इवेंट",
    it: "Matrimonio/Evento",
    nl: "Bruiloft/Evenement",
    tr: "Düğün/Etkinlik",
    id: "Pernikahan/Acara",
    am: "ሰርግ/ዝግጅት",
    rw: "Ubukwe/Ibirori",
  },
  "customer.mobile.screens.partnerProfile.customTplOccasion": {
    de: "Besonderer Anlass",
    hi: "विशेष अवसर",
    it: "Occasione speciale",
    nl: "Speciale gelegenheid",
    tr: "Özel gün",
    id: "Acara khusus",
    am: "ልዩ አጋጣሚ",
    rw: "Ibirori byihariye",
  },
  "customer.mobile.screens.partnerProfile.customTplPackage": {
    de: "Paketangebot",
    hi: "पैकेज डील",
    it: "Pacchetto",
    nl: "Pakketdeal",
    tr: "Paket teklif",
    id: "Paket penawaran",
    am: "ጥቅል ቅናሽ",
    rw: "Ipaki",
  },
  "customer.mobile.screens.partnerProfile.customTplGroup": {
    de: "Gruppenbuchung",
    hi: "ग्रुप बुकिंग",
    it: "Prenotazione di gruppo",
    nl: "Groepsboeking",
    tr: "Grup rezervasyonu",
    id: "Pemesanan grup",
    am: "የቡድን ቦታ ማስያዣ",
    rw: "Kubika itsinda",
  },
};

for (const [key, row] of Object.entries(KEYS)) {
  for (const locale of EXTRA) {
    if (!row[locale]) throw new Error(`missing ${locale} for ${key}`);
  }
}

for (const locale of EXTRA) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = deepMerge(JSON.parse(fs.readFileSync(localePath, "utf8")), EN_DELTA);
  for (const [key, row] of Object.entries(KEYS)) deepSet(data, key, row[locale]);
  fs.writeFileSync(localePath, JSON.stringify(data, null, 2) + "\n");
  console.log("updated", locale, Object.keys(KEYS).length, "keys");
}

console.log("done extra fix");
