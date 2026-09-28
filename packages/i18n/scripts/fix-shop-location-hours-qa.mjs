#!/usr/bin/env node
/** QA fix: proper shop locationHours + readiness titles (no English calques on cart/checkout). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");

const LOCALES = [
  "af", "am", "ar", "de", "es", "fr", "hi", "id", "it", "nl", "nso", "pt", "rw", "ss", "st", "sw", "tn", "tr", "ts", "ve", "xh", "zu",
];

/** Path → per-locale string */
const PATCHES = {
  "customer.mobile.tabs.shop.locationHours.notListed": {
    af: "Uure nie gelys nie",
    am: "ሰዓታት አልተመዘገቡም",
    ar: "الساعات غير مذكورة",
    de: "Öffnungszeiten nicht angegeben",
    es: "Horario no indicado",
    fr: "Heures non renseignées",
    hi: "घंटे सूचीबद्ध नहीं हैं",
    id: "Jam operasional tidak tercantum",
    it: "Orari non indicati",
    nl: "Openingstijden niet vermeld",
    nso: "Dihora ga di ngwadišwe",
    pt: "Horário não indicado",
    rw: "Amasaha ntabwo yanditse",
    ss: "Amahora awacatjuli",
    st: "Lihora ha li ngolilohe",
    sw: "Saa hazijaorodheshwa",
    tn: "Diura ga di kwadilwe",
    tr: "Çalışma saatleri belirtilmemiş",
    ts: "Tiawara a ti tsariwanga",
    ve: "Tiawara dzi sa ngwalelwaho",
    xh: "Iiyure azichazwanga",
    zu: "Amahora awakafakwanga",
  },
  "customer.mobile.tabs.shop.locationHours.openUntil": {
    af: "Open tot {{time}}",
    am: "እስከ {{time}} ክፍት",
    ar: "مفتوح حتى {{time}}",
    de: "Geöffnet bis {{time}}",
    es: "Abierto hasta {{time}}",
    fr: "Ouvert jusqu'à {{time}}",
    hi: "{{time}} तक खुला",
    id: "Buka hingga {{time}}",
    it: "Aperto fino alle {{time}}",
    nl: "Open tot {{time}}",
    nso: "O bula go fihla {{time}}",
    pt: "Aberto até {{time}}",
    rw: "Yafunguye kugeza {{time}}",
    ss: "Ivulekile kuze kube {{time}}",
    st: "E butswe ho fihlela {{time}}",
    sw: "Imefunguliwa hadi {{time}}",
    tn: "E bule go fitlha {{time}}",
    tr: "{{time}} saatine kadar açık",
    ts: "Yi pfule ku fikela {{time}}",
    ve: "I vulegile u swika {{time}}",
    xh: "Ivuliwe de kube {{time}}",
    zu: "Ivulekile kuze kube {{time}}",
  },
  "customer.mobile.tabs.shop.locationHours.closed": {
    af: "Nou gesluit",
    am: "አሁን ዝግ ነው",
    ar: "مغلق الآن",
    de: "Jetzt geschlossen",
    es: "Cerrado ahora",
    fr: "Fermé actuellement",
    hi: "अभी बंद",
    id: "Tutup sekarang",
    it: "Chiuso ora",
    nl: "Nu gesloten",
    nso: "E tswaletšwe gomona",
    pt: "Fechado agora",
    rw: "Ifunze ubu",
    ss: "Ivaliwe manje",
    st: "E koetsoe hona joale",
    sw: "Imefungwa sasa",
    tn: "E tswetswe gone jaanong",
    tr: "Şu an kapalı",
    ts: "Yi pfale sweswi",
    ve: "I pfalaho zwino",
    xh: "Ivaliwe ngoku",
    zu: "Ivaliwe manje",
  },
  "customer.mobile.tabs.shop.locationHours.closedOpens": {
    af: "Gesluit · Open {{day}} om {{time}}",
    am: "ዝግ · {{day}} በ{{time}} ይከፈታል",
    ar: "مغلق · يفتح {{day}} {{time}}",
    de: "Geschlossen · Öffnet {{day}} um {{time}}",
    es: "Cerrado · Abre {{day}} a las {{time}}",
    fr: "Fermé · Ouvre {{day}} à {{time}}",
    hi: "बंद · {{day}} {{time}} पर खुलता है",
    id: "Tutup · Buka {{day}} pukul {{time}}",
    it: "Chiuso · Apre {{day}} alle {{time}}",
    nl: "Gesloten · Opent {{day}} om {{time}}",
    nso: "E tswaletšwe · E bula {{day}} ka {{time}}",
    pt: "Fechado · Abre {{day}} às {{time}}",
    rw: "Ifunze · Ifungura {{day}} saa {{time}}",
    ss: "Ivaliwe · Ivula ngo-{{day}} {{time}}",
    st: "E koetsoe · E bula {{day}} ka {{time}}",
    sw: "Imefungwa · Inafungua {{day}} saa {{time}}",
    tn: "E tswetswe · E bula {{day}} ka {{time}}",
    tr: "Kapalı · {{day}} {{time}}'de açılır",
    ts: "Yi pfariwile · Yi pfule {{day}} {{time}}",
    ve: "I pfali · I vula {{day}} {{time}}",
    xh: "Ivaliwe · Ivula ngo-{{day}} {{time}}",
    zu: "Ivaliwe · Ivula ngo-{{day}} {{time}}",
  },
  "customer.mobile.tabs.shop.locationHours.closedShort": {
    af: "Gesluit",
    am: "ዝግ",
    ar: "مغلق",
    de: "Geschlossen",
    es: "Cerrado",
    fr: "Fermé",
    hi: "बंद",
    id: "Tutup",
    it: "Chiuso",
    nl: "Gesloten",
    nso: "E tswaletšwe",
    pt: "Fechado",
    rw: "Ifunze",
    ss: "Ivaliwe",
    st: "E koetsoe",
    sw: "Imefungwa",
    tn: "E tswetswe",
    tr: "Kapalı",
    ts: "Yi pfariwile",
    ve: "I pfali",
    xh: "Ivaliwe",
    zu: "Ivaliwe",
  },
  "customer.mobile.tabs.shop.pickupStore.pickupInstructions": {
    af: "Optelinstruksies",
    zu: "Imiyalelo yokuthatha",
    fr: "Instructions de retrait",
    ar: "تعليمات الاستلام",
    de: "Abholhinweise",
    es: "Instrucciones de recogida",
    pt: "Instruções de recolha",
  },
  "customer.mobile.tabs.shop.pickupStore.viewAllLocations": {
    af: "Bekyk al {{count}} ligginge",
    zu: "Buka zonke izindawo ezi-{{count}}",
    fr: "Voir les {{count}} lieux",
    ar: "عرض جميع المواقع ({{count}})",
    de: "Alle {{count}} Standorte anzeigen",
    es: "Ver las {{count}} ubicaciones",
    pt: "Ver todos os {{count}} locais",
  },
  "provider.mobile.components.bookingCreateReadiness.title": {
    af: "Besprekingschecklys · {{completed}}/{{total}}",
    am: "የቡኪንግ ዝርዝር · {{completed}}/{{total}}",
    ar: "قائمة الحجز · {{completed}}/{{total}}",
    de: "Buchungs-Checkliste · {{completed}}/{{total}}",
    es: "Lista de reserva · {{completed}}/{{total}}",
    fr: "Liste de contrôle · {{completed}}/{{total}}",
    hi: "बुकिंग चेकलिस्ट · {{completed}}/{{total}}",
    id: "Daftar periksa booking · {{completed}}/{{total}}",
    it: "Checklist prenotazione · {{completed}}/{{total}}",
    nl: "Boekingschecklist · {{completed}}/{{total}}",
    nso: "Lenaneo la go beela · {{completed}}/{{total}}",
    pt: "Lista de reserva · {{completed}}/{{total}}",
    rw: "Urutonde rw'ubuhahirane · {{completed}}/{{total}}",
    ss: "Luhla lwemibhukho · {{completed}}/{{total}}",
    st: "Lenane la ho behela · {{completed}}/{{total}}",
    sw: "Orodha ya uhifadhi · {{completed}}/{{total}}",
    tn: "Lenaneo la go beela · {{completed}}/{{total}}",
    tr: "Rezervasyon kontrol listesi · {{completed}}/{{total}}",
    ts: "Nxaxamelo wa ku buka · {{completed}}/{{total}}",
    ve: "Mutevhe wa u buka · {{completed}}/{{total}}",
    xh: "Uluhlu lokubhukisha · {{completed}}/{{total}}",
    zu: "Uhlu lokubhuka · {{completed}}/{{total}}",
  },
};

function setPath(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

for (const code of LOCALES) {
  const file = path.join(localesDir, `${code}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [pathKey, byLocale] of Object.entries(PATCHES)) {
    const val = byLocale[code];
    if (val) setPath(data, pathKey, val);
    if (pathKey === "provider.mobile.components.bookingCreateReadiness.title" && val) {
      setPath(data, "web.provider.bookings.createReadiness.title", val);
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log("fixed", code);
}

console.log("done");
