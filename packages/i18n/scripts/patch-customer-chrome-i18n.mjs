#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");
const LANGS = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "fr", "ar", "sw", "pt", "es"];

function deepMerge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return source;
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target?.[k] && typeof target[k] === "object") {
      out[k] = deepMerge(target[k], v);
    } else {
      out[k] = v;
    }
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

const EN_DELTA = {
  customer: {
    cart: "Cart",
  },
};

const TR = {
  "customer.home": ["Tuis", "Ikhaya", "Ikhaya", "Lehae", "Gae", "Gae", "Kaya", "Haya", "Ekhaya", "Accueil", "الرئيسية", "Nyumbani", "Início", "Inicio"],
  "customer.explore": ["Verken", "Hlola", "Khangela", "Hlahloba", "Hlahloba", "Tlhatlhoba", "Langutisa", "Sedzani", "Hlola", "Explorer", "استكشف", "Gundua", "Explorar", "Explorar"],
  "customer.search": ["Soek", "Sesha", "Khangela", "Batla", "Nyaka", "Batla", "Lava", "Ṱoḓani", "Sesha", "Rechercher", "بحث", "Tafuta", "Pesquisar", "Buscar"],
  "customer.searchShort": ["Soek", "Sesha", "Khangela", "Batla", "Nyaka", "Batla", "Lava", "Ṱoḓani", "Sesha", "Recherche", "بحث", "Tafuta", "Pesquisar", "Buscar"],
  "customer.bookings": ["My besprekings", "Ukubhuka kwami", "Ukubhukisha kwam", "Libuka tsa ka", "Dipukiso tša ka", "Dipukiso tsa me", "Ku buka ka mina", "U buka hanga", "Kubhuka kwami", "Mes réservations", "حجوزاتي", "Nafasi zangu", "As minhas marcações", "Mis reservas"],
  "customer.bookingsShort": ["Besprekings", "Ukubhuka", "Ukubhukisha", "Libuka", "Dipukiso", "Dipukiso", "Ku buka", "U buka", "Kubhuka", "Réservations", "الحجوزات", "Nafasi", "Marcações", "Reservas"],
  "customer.messages": ["Boodskappe", "Imilayezo", "Imiyalezo", "Melaetsa", "Melaetša", "Melaetsa", "Marungula", "Milaedza", "Imilayezo", "Messages", "الرسائل", "Ujumbe", "Mensagens", "Mensajes"],
  "customer.messagesShort": ["Klets", "Ingxoxo", "Iincoko", "Lipuisano", "Dipoledišano", "Dipuisano", "Makanelwa", "Nyambedzano", "Tingcoco", "Discussions", "الدردشات", "Soga", "Chats", "Chats"],
  "customer.profile": ["Profiel", "Iphrofayela", "Iprofayile", "Profaele", "Profaele", "Profaele", "Phurofayili", "Phurofaily", "Iphrofayela", "Profil", "الملف الشخصي", "Wasifu", "Perfil", "Perfil"],
  "customer.account": ["Rekening", "I-akhawunti", "Iakhawunti", "Akhaonto", "Akhauute", "Akhauunte", "Akhawunti", "Akhaunte", "Li-akhawunti", "Compte", "الحساب", "Akaunti", "Conta", "Cuenta"],
  "customer.favorites": ["Gunstelinge", "Izintandokazi", "Izintandokazi", "Tse ratoang", "Tše di ratwago", "Tse di ratwang", "Swo rhandziwa", "Zwo funwaho", "Tintandokati", "Favoris", "المفضلة", "Vipendwa", "Favoritos", "Favoritos"],
  "customer.loyalty": ["Lojaliteit", "Ukwethembeka", "Ukuthembeka", "Botšepehi", "Botšepegi", "Botshepegi", "Ku tshembeka", "Vhuthembeki", "Kutsembeka", "Fidélité", "الولاء", "Uaminifu", "Fidelização", "Fidelidad"],
  "customer.referrals": ["Verwysings", "Izincomo", "Iingcebiso", "Litšupiso", "Ditšhupetšo", "Ditshupiso", "Swirhamba", "Zwirumelwa", "Tinkhomo", "Parrainages", "الإحالات", "Rufaa", "Indicações", "Referidos"],
  "customer.giftCards": ["Geskenkkaarte", "Amakhadi ezipho", "Amakhadi ezipho", "Likarete tsa mpho", "Dikarata tša mpho", "Dikarata tsa mpho", "Tikhadi ta nyiko", "Khadi dza nyiko", "Emakhadi etipho", "Cartes cadeaux", "بطاقات الهدايا", "Kadi za zawadi", "Cartões de oferta", "Tarjetas de regalo"],
  "customer.wallet": ["Beursie", "Isikhwama", "Isikhwama", "Sepache", "Sepotla", "Sepatšhe", "Xikhwama", "Tshikhwama", "Sikhwama", "Portefeuille", "المحفظة", "Pochi", "Carteira", "Billetera"],
  "customer.cart": ["Mandjie", "Inqola", "Inqwelo", "Kariki", "Koloi", "Koloi", "Ngola", "Ngola", "Inqola", "Panier", "السلة", "Kikapu", "Carrinho", "Carrito"],
  "customer.personalInfo": ["Persoonlike inligting", "Ulwazi lomuntu siqu", "Inkcazelo yomntu", "Lintlha tsa motho", "Tshedimošo ya motho", "Tshedimosetso ya motho", "Vuxokoxoko bya munhu", "Vhutsila ha muthu", "Lwati lomuntfu", "Informations personnelles", "المعلومات الشخصية", "Taarifa binafsi", "Informações pessoais", "Información personal"],
  "customer.loginSecurity": ["Aanmelding en sekuriteit", "Ukungena nokuvikeleka", "Ukungena nokhuseleko", "Ho kena le tšireletso", "Go tsena le tšhireletšo", "Go tsena le pabalesego", "Ku ngena ni nsirhelelo", "U dzhena na tsireledzo", "Kungena nekuivikela", "Connexion et sécurité", "تسجيل الدخول والأمان", "Kuingia na usalama", "Início de sessão e segurança", "Inicio de sesión y seguridad"],
  "customer.notifications": ["Kennisgewings", "Izaziso", "Izaziso", "Litsebiso", "Ditsebiso", "Dikitsiso", "Switiviso", "Zwiṱivhadzo", "Tatiso", "Notifications", "الإشعارات", "Arifa", "Notificações", "Notificaciones"],
  "customer.preferences": ["Voorkeure", "Izintandokazi", "Izintandokazi", "Litakatso", "Dikganyogo", "Dikganyogo", "Swinavelelo", "Zwitakalelwa", "Tintandvo", "Préférences", "التفضيلات", "Mapendeleo", "Preferências", "Preferencias"],
  "customer.privacy": ["Privaatheid en deel", "Ubumfihlo nokwabelana", "Ubucala nokwabelana", "Lekunutu le ho arolelana", "Sephiri le go abelana", "Sephiri le go abelana", "Xihundla ni ku avelana", "Tshidzumbe na u kavha", "Timfihlo nekwabelana", "Confidentialité et partage", "الخصوصية والمشاركة", "Faragha na kushiriki", "Privacidade e partilha", "Privacidad y uso compartido"],
  "customer.profileTab.quickActions.bookings": ["Besprekings", "Ukubhuka", "Ukubhukisha", "Libuka", "Dipukiso", "Dipukiso", "Ku buka", "U buka", "Kubhuka", "Réservations", "الحجوزات", "Nafasi", "Marcações", "Reservas"],
  "customer.profileTab.quickActions.orders": ["Bestellings", "Ama-oda", "Iiodolo", "Liodara", "Ditaelo", "Ditaelo", "Tiodara", "Diodara", "Ema-oda", "Commandes", "الطلبات", "Oda", "Encomendas", "Pedidos"],
  "customer.profileTab.quickActions.wallet": ["Beursie", "Isikhwama", "Isikhwama", "Sepache", "Sepotla", "Sepatšhe", "Xikhwama", "Tshikhwama", "Sikhwama", "Portefeuille", "المحفظة", "Pochi", "Carteira", "Billetera"],
  "customer.profileTab.quickActions.saved": ["Gestoor", "Okulondoloziwe", "Okugciniweyo", "Tse bolokiloeng", "Tše di bolokilwego", "Tse di bolokilweng", "Leswi hlayisiweke", "Zwo vhewa", "Lokugciniwe", "Enregistrés", "المحفوظات", "Zilizohifadhiwa", "Guardados", "Guardados"],
};

for (const [key, vals] of Object.entries(TR)) {
  if (vals.length !== LANGS.length) throw new Error(`${key} bad length`);
}

const enPath = path.join(localesDir, "en.json");
const en = deepMerge(JSON.parse(fs.readFileSync(enPath, "utf8")), EN_DELTA);
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n");
console.log("updated en.json");

for (const locale of LANGS) {
  const localePath = path.join(localesDir, `${locale}.json`);
  const data = deepMerge(JSON.parse(fs.readFileSync(localePath, "utf8")), EN_DELTA);
  for (const [key, vals] of Object.entries(TR)) {
    deepSet(data, key, vals[LANGS.indexOf(locale)]);
  }
  fs.writeFileSync(localePath, JSON.stringify(data, null, 2) + "\n");
  console.log("updated", locale);
}
