#!/usr/bin/env node
/** Customer surfaces CI: translate contentReport keys still identical to en (incl. illegal_exploitative). */
import fs from "node:fs";
import path from "node:path";
import {
  TARGET_LOCALES,
  LOCALES_DIR,
  isCustomerSurfaceLeftover,
  flattenLocale,
  auditCustomerSurfaces,
} from "./_customer-surfaces-scope.mjs";
import { safeWriteJson } from "./_safe-write-json.mjs";

const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8"));
const EN = en.customer.contentReport;
const EN_REASON = EN.reason;

/** @type {Record<string, { report: Record<string, string>; reason: Record<string, string> }>} */
const BY_LOCALE = {
  af: {
    report: {
      modalTitle: "Rapporteer inhoud",
      modalLead: "Kies 'n rede en voeg opsionele besonderhede by sodat ons span dit kan nagaan.",
      submitCta: "Dien verslag in",
      detailsPlaceholder: "Bykomende besonderhede (opsioneel)",
      selectReasonTitle: "Kies 'n rede",
      selectReasonBody: "Kies asseblief waarom jy hierdie inhoud rapporteer.",
      submitError: "Kon nie verslag indien nie.",
      submittedTitle: "Verslag ingedien",
      submittedBody: "Dankie. Ons span sal jou verslag binne 24 uur nagaan.",
    },
    reason: {
      inappropriate: "Onvanpaste inhoud",
      misleading: "Misleidende inligting",
      harassment: "Teistering of misbruik",
      spam: "Strooipos of bedrog",
      safety: "Veiligheidskwessie",
      illegal_exploitative: "Onwettige of uitbuitende inhoud",
    },
  },
  zu: {
    report: {
      modalTitle: "Bika okuqukethwe",
      modalLead: "Khetha isizathu bese ungeza imininingwane eyingozi ukuze ithimba lethu lihlaziye.",
      submitCta: "Thumela umbiko",
      detailsPlaceholder: "Imininingwane eyengeziwe (okungakhethwa)",
      selectReasonTitle: "Khetha isizathu",
      selectReasonBody: "Sicela ukhethe ukuthi kungani ubika lokhu okuqukethwe.",
      submitError: "Ayikwazanga ukuthumela umbiko.",
      submittedTitle: "Umbiko uthunyelwe",
      submittedBody: "Siyabonga. Ithimba lethu lizohlaziya umbiko wakho phakathi namahora angu-24.",
    },
    reason: {
      inappropriate: "Okuqukethwe okungafanele",
      misleading: "Ulwazi oludangisa",
      harassment: "Ukuhlukumeza noma ukuhlukunyezwa",
      spam: "I-spam noma ukukhwabanisa",
      safety: "Ukukhathazeka ngokuphepha",
      illegal_exploitative: "Okuqukethwe okungekho emthethweni noma okuxhaphaza",
    },
  },
  xh: {
    report: {
      modalTitle: "Xela umxholo",
      modalLead: "Khetha isizathu uze wonge iinkcukacha ezingakhethwa ukuze iqela lethu lijonge.",
      submitCta: "Thumela ingxelo",
      detailsPlaceholder: "Iinkcukacha ezingeziweyo (uyakukhetha)",
      selectReasonTitle: "Khetha isizathu",
      selectReasonBody: "Nceda ukhethe ukuba kutheni uxela lo mxholo.",
      submitError: "Ayikwazanga ukuthumela ingxelo.",
      submittedTitle: "Ingxelo ithunyelwe",
      submittedBody: "Enkosi. Iqela lethu liya kujonga ingxelo yakho phakathi kwiiyure ezingama-24.",
    },
    reason: {
      inappropriate: "Umxholo ongafanelekanga",
      misleading: "Ulwazi oludangisayo",
      harassment: "Ukuhlukumeza okanye ukuhlukunyezwa",
      spam: "I-spam okanye ubuqhophololo",
      safety: "Ukukhathazeka ngokhuseleko",
      illegal_exploitative: "Umxholo ongekho mthethweni okanye oqhelekayo",
    },
  },
  st: {
    report: {
      modalTitle: "Tlaleha litaba",
      modalLead: "Khetha lebaka 'me u kenye lintlha tse ling khethoang hore sehlopha sa rona se li hlahlobe.",
      submitCta: "Romella tlaleho",
      detailsPlaceholder: "Lintlha tse ling (boikhethelo)",
      selectReasonTitle: "Khetha lebaka",
      selectReasonBody: "Ka kopo khetha hore na ke hobane'ng u tlaleha litaba tsena.",
      submitError: "Ha ea khona ho romella tlaleho.",
      submittedTitle: "Tlaleho e rometsoe",
      submittedBody: "Re leboha. Sehlopha sa rona se tla hlahloba tlaleho ea hau ka mor'a lihora tse 24.",
    },
    reason: {
      inappropriate: "Litaba tse sa lokelang",
      misleading: "Lintlha tse fosaang",
      harassment: "Ho hlekefetsa kapa ho sebelisa ka mpe",
      spam: "Spam kapa bomenemene",
      safety: "Tšoenyeho ea polokeho",
      illegal_exploitative: "Litaba tse sa lokelang molao kapa tse sebelisang batho ka mpe",
    },
  },
  nso: {
    report: {
      modalTitle: "Begela diteng",
      modalLead: "Kgetha lebaka gomme o oketše dintlha tša kgetho go re sehlopha se di sekaseke.",
      submitCta: "Romela pego",
      detailsPlaceholder: "Dintlha tše di oketšegilego (ya kgetho)",
      selectReasonTitle: "Kgetha lebaka",
      selectReasonBody: "Hle kgetha gore ke ka baka la’ng o begela diteng tše.",
      submitError: "Ga go kgonege go romela pego.",
      submittedTitle: "Pego e rometšwe",
      submittedBody: "Re a leboga. Sehlopha sa rena se tla sekaseka pego ya gago mo diureng tše 24.",
    },
    reason: {
      inappropriate: "Diteng tše di sa swanelago",
      misleading: "Tshedimošo ye e fenyafenyago",
      harassment: "Go hlokofadisa goba go sebedisa ka mpe",
      spam: "Spam goba bomenemene",
      safety: "Kgopolo ya polokego",
      illegal_exploitative: "Diteng tše di sa swanelago molao goba tše di sebedisago batho ka mpe",
    },
  },
  tn: {
    report: {
      modalTitle: "Begela diteng",
      modalLead: "Tlhopha lebaka mme o oketse dintlha tsa gago go re sehlopha se di sekaseke.",
      submitCta: "Romela pegelo",
      detailsPlaceholder: "Dintlha tse dingwe (tse o ka di tlhopheng)",
      selectReasonTitle: "Tlhopha lebaka",
      selectReasonBody: "Tsweetswee tlhopha gore ke ka baka la’ng o begela diteng tse.",
      submitError: "Ga go kgonege go romela pegelo.",
      submittedTitle: "Pegelo e rometswe",
      submittedBody: "Re lebogela. Sehlopha sa rona se tla sekaseka pegelo ya gago mo diura tse 24.",
    },
    reason: {
      inappropriate: "Diteng tse di sa siamang",
      misleading: "Tshedimosetso e e fosaang",
      harassment: "Go tlhoka botlhoko goba go dirisiwa ka mpe",
      spam: "Spam goba bomenemene",
      safety: "Kgatlhego ya polokego",
      illegal_exploitative: "Diteng tse di sa siamang molao goba tse di dirisiwang ka mpe",
    },
  },
  ts: {
    report: {
      modalTitle: "Vika swilo leswi nga endzeni",
      modalLead: "Hlawula xivangelo u tlhela u engetela vuxokoxoko byo hlawuleka leswaku ntlawa wa hina wu swi languta.",
      submitCta: "Rhumela ripoti",
      detailsPlaceholder: "Vuxokoxoko byo engetela (byo hlawuleka)",
      selectReasonTitle: "Hlawula xivangelo",
      selectReasonBody: "Hi kombela u hlawula hikuva yini u vika swilo leswi.",
      submitError: "A swi kotekanga ku rhumela ripoti.",
      submittedTitle: "Ripoti yi rhumeriwile",
      submittedBody: "Inkomu. Ntlawa wa hina wu ta languta ripoti ya wena ku nga si hela tiawara ta 24.",
    },
    reason: {
      inappropriate: "Swilo leswi nga faneleki",
      misleading: "Mahungu lama pfulelaka",
      harassment: "Ku xanisiwa kumbe ku tirhisiwa hi ndlela yo biha",
      spam: "Spam kumbe vuhandzi",
      safety: "Xiphiqo xa vuhlayiseki",
      illegal_exploitative: "Swilo leswi nga riki na nawu kumbe leswi tirhisiwaka hi ndlela yo biha",
    },
  },
  ve: {
    report: {
      modalTitle: "Vhiga zwithu zwi re hone",
      modalLead: "Nangani tshivhangela u ita zwo ṅwaliswaho zwine tshigwada tshashu tshi nga zwi sedzulusa.",
      submitCta: "Rumela muvhigo",
      detailsPlaceholder: "Zwinzhi (zwo nangwaho)",
      selectReasonTitle: "Nangani tshivhangela",
      selectReasonBody: "Ri humbela u nanga hani u vhiga zwithu zwi.",
      submitError: "A zwi kona u rumela muvhigo.",
      submittedTitle: "Muvhigo wo rumelwa",
      submittedBody: "Ndo livhuwa. Tshigwada tshashu tshi do sedzulusa muvhigo wawe u fhira awara dzi 24.",
    },
    reason: {
      inappropriate: "Zwithu zwi songo fanelaho",
      misleading: "Mafhungo a re pfufhaho",
      harassment: "U katela kana u shandiswa zwi sa re",
      spam: "Spam kana buhumbi",
      safety: "Khathihi ya tsireledzo",
      illegal_exploitative: "Zwithu zwi re hone zwi songo re na nawu kana zwi shandiswaho zwi sa re",
    },
  },
  ss: {
    report: {
      modalTitle: "Bika lokucuketfwe",
      modalLead: "Khetsa sizatfu bese ungeta imininingwane leyikhetsiwe ukuze liqembu letsine lihlaziye.",
      submitCta: "Tfumela umbiko",
      detailsPlaceholder: "Imininingwane leyengeziwe (leikhetsiwe)",
      selectReasonTitle: "Khetsa sizatfu",
      selectReasonBody: "Sicela ukhetse kutsi kungani ubika lokucuketfwe.",
      submitError: "Akukwati kutfumela umbiko.",
      submittedTitle: "Umbiko utfunyelwe",
      submittedBody: "Siyabonga. Liqembu letsine litawuhlaziya umbiko wakho kungakapheli emahora langu-24.",
    },
    reason: {
      inappropriate: "Lokucuketfwe lokungafanele",
      misleading: "Lwati loludvumisa",
      harassment: "Kuhlukunyezwa noma kusebentiswa kabi",
      spam: "I-spam noma kubanjwa",
      safety: "Inhlekelele yekuphepha",
      illegal_exploitative: "Lokucuketfwe lelingekho emtsetfweni noma lokusebentiswa kabi",
    },
  },
  fr: {
    report: {
      modalLead: "Choisissez un motif et ajoutez des détails optionnels pour que notre équipe puisse examiner.",
      submittedTitle: "Signalement envoyé",
      submittedBody: "Merci. Notre équipe examinera votre signalement sous 24 heures.",
    },
    reason: {
      spam: "Spam ou arnaque",
      illegal_exploitative: "Contenu illégal ou exploiteur",
    },
  },
  ar: {
    report: {
      modalLead: "اختر سببًا وأضف تفاصيل اختيارية لمراجعتها من قِبل فريقنا.",
      submittedTitle: "تم إرسال البلاغ",
      submittedBody: "شكرًا لك. سيراجع فريقنا بلاغك خلال 24 ساعة.",
    },
    reason: {
      illegal_exploitative: "محتوى غير قانوني أو استغلالي",
    },
  },
  sw: {
    report: {
      modalLead: "Chagua sababu na ongeza maelezo ya hiari ili timu yetu iweze kukagua.",
      submittedTitle: "Ripoti imetumwa",
      submittedBody: "Asante. Timu yetu itakagua ripoti yako ndani ya saa 24.",
    },
    reason: {
      illegal_exploitative: "Maudhui haramu au yanayotumia vibaya",
    },
  },
  pt: {
    report: {
      modalLead: "Selecione um motivo e adicione detalhes opcionais para a nossa equipa analisar.",
      submittedTitle: "Denúncia enviada",
      submittedBody: "Obrigado. A nossa equipa analisará a sua denúncia em 24 horas.",
    },
    reason: {
      inappropriate: "Conteúdo inadequado",
      harassment: "Assédio ou abuso",
      spam: "Spam ou fraude",
      illegal_exploitative: "Conteúdo ilegal ou exploratório",
    },
  },
  es: {
    report: {
      modalLead: "Selecciona un motivo y añade detalles opcionales para que nuestro equipo lo revise.",
      submittedTitle: "Informe enviado",
      submittedBody: "Gracias. Nuestro equipo revisará tu informe en 24 horas.",
    },
    reason: {
      inappropriate: "Contenido inapropiado",
      harassment: "Acoso o abuso",
      spam: "Spam o estafa",
      illegal_exploitative: "Contenido ilegal o explotador",
    },
  },
  de: {
    report: {
      modalLead: "Wählen Sie einen Grund und fügen Sie optionale Details hinzu, damit unser Team prüfen kann.",
      submittedTitle: "Meldung gesendet",
      submittedBody: "Danke. Unser Team prüft Ihre Meldung innerhalb von 24 Stunden.",
    },
    reason: {
      illegal_exploitative: "Illegale oder ausbeuterische Inhalte",
    },
  },
  hi: {
    report: {
      modalLead: "कोई कारण चुनें और वैकल्पिक विवरण जोड़ें ताकि हमारी टीम समीक्षा कर सके।",
      submittedTitle: "रिपोर्ट भेजी गई",
      submittedBody: "धन्यवाद। हमारी टीम 24 घंटे के भीतर आपकी रिपोर्ट की समीक्षा करेगी।",
    },
    reason: {
      illegal_exploitative: "अवैध या शोषणकारी सामग्री",
    },
  },
  id: {
    report: {
      modalLead: "Pilih alasan dan tambahkan detail opsional agar tim kami dapat meninjau.",
      submittedTitle: "Laporan terkirim",
      submittedBody: "Terima kasih. Tim kami akan meninjau laporan Anda dalam 24 jam.",
    },
    reason: {
      illegal_exploitative: "Konten ilegal atau eksploitatif",
    },
  },
  tr: {
    report: {
      modalLead: "Ekibimizin inceleyebilmesi için bir neden seçin ve isteğe bağlı ayrıntılar ekleyin.",
      submittedTitle: "Rapor gönderildi",
      submittedBody: "Teşekkürler. Ekibimiz raporunuzu 24 saat içinde inceleyecek.",
    },
    reason: {
      illegal_exploitative: "Yasa dışı veya sömürücü içerik",
    },
  },
  am: {
    report: {
      modalLead: "ምክንያት ይምረጡ እና ቡድናችን እንዲመርምር ለማስቻል አማራጭ ዝርዝሮችን ያክሉ።",
      submittedTitle: "ሪፖርት ተልኳል",
      submittedBody: "አመሰግናለሁ። ቡድናችን ሪፖርትዎን በ24 ሰዓት ውስጥ ይመርምራል።",
    },
    reason: {
      illegal_exploitative: "ሕገወጥ ወይም ጭቆና የሚፈጥር ይዘት",
    },
  },
  rw: {
    report: {
      modalLead: "Hitamo impamvu wongereho ibisobanuro by'ubushake kugira ngo itsinda ryacu ribisuzume.",
      submittedTitle: "Raporo yoherejwe",
      submittedBody: "Murakoze. Itsinda ryacu rizasuzuma raporo yawe mu masaha 24.",
    },
    reason: {
      illegal_exploitative: "Ibirimo bitari mu mategeko cyangwa byica abantu",
    },
  },
  nl: {
    report: {
      modalLead: "Kies een reden en voeg optionele details toe zodat ons team dit kan beoordelen.",
      submittedTitle: "Melding verzonden",
      submittedBody: "Bedankt. Ons team beoordeelt je melding binnen 24 uur.",
    },
    reason: {
      illegal_exploitative: "Illegale of uitbuitende content",
    },
  },
  it: {
    report: {
      modalLead: "Seleziona un motivo e aggiungi dettagli facoltativi così il nostro team potrà esaminare.",
      submittedTitle: "Segnalazione inviata",
      submittedBody: "Grazie. Il nostro team esaminerà la segnalazione entro 24 ore.",
    },
    reason: {
      illegal_exploitative: "Contenuto illegale o sfruttatore",
    },
  },
};

function deepSet(obj, parts, value) {
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
  if (!data.customer) data.customer = {};
  if (!data.customer.contentReport) data.customer.contentReport = {};
  if (!data.customer.contentReport.reason) data.customer.contentReport.reason = {};

  const flat = flattenLocale(data);

  for (const [field, value] of Object.entries(patch.report ?? {})) {
    const enVal = EN[field];
    if (typeof enVal !== "string" || typeof value !== "string") continue;
    const key = `customer.contentReport.${field}`;
    const current = flat.get(key);
    if (typeof current === "string" && !isCustomerSurfaceLeftover(enVal, current)) continue;
    if (isCustomerSurfaceLeftover(enVal, value)) continue;
    deepSet(data, ["customer", "contentReport", field], value);
    updated += 1;
  }

  for (const [field, value] of Object.entries(patch.reason ?? {})) {
    const enVal = EN_REASON[field];
    if (typeof enVal !== "string" || typeof value !== "string") continue;
    const key = `customer.contentReport.reason.${field}`;
    const current = flat.get(key);
    if (typeof current === "string" && !isCustomerSurfaceLeftover(enVal, current)) continue;
    if (isCustomerSurfaceLeftover(enVal, value)) continue;
    deepSet(data, ["customer", "contentReport", "reason", field], value);
    updated += 1;
  }

  safeWriteJson(filePath, data);
}

const after = auditCustomerSurfaces();
console.log(`Updated ${updated} fields; total leftover: ${after.totalLeftover}`);
process.exit(after.totalLeftover === 0 ? 0 : 1);
