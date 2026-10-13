/** Hand-checked translations for card-machine / Yoco refund keys (brand names stay in Latin script). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeWriteJson } from "../scripts/_safe-write-json.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "../src/locales");
const M = "provider.mobile.screens.bookingDetail.";
const C = "provider.mobile.screens.cardMachineCollect.";
const WR = "web.provider.bookings.detail.refund.";
const WD = "web.provider.bookings.detail.dialogs.";
const RP = "web.provider.reports.pages.payments/card-machine-reconciliation.";

const overrides = {
  am: {
    [`${M}cancelRefundCardHint`]:
      "በካርድ ማሽን የተከፈሉ ክፍያዎች ወደ ደንበኛው ካርድ ይመለሳሉ (Beautonomi ማሽኖች በራስ-ሰር፤ በYoco ላይ በማሽኑ ተመላሽ አድርገው ይመዘግባሉ)። በመስመር ላይ የተከፈሉ ክፍያዎች ወደ ቦርሳቸው ገቢ ይደረጋሉ።",
    [`${WD}cancelRefundCardHint`]:
      "በካርድ ማሽን የተከፈሉ ክፍያዎች ወደ ደንበኛው ካርድ ይመለሳሉ (Beautonomi ማሽኖች በራስ-ሰር፤ በYoco ላይ በማሽኑ ተመላሽ አድርገው ይመዘግባሉ)። በመስመር ላይ የተከፈሉ ክፍያዎች ወደ ቦርሳቸው ገቢ ይደረጋሉ።",
    [`${M}yocoRefundOnMachineTitle`]: "በYoco ማሽንዎ ላይ ተመላሽ ያድርጉ",
    [`${M}yocoRefundOnMachineBody`]:
      "የYoco ተመላሽ ገንዘቦች ከBeautonomi ሊጀመሩ አይችሉም። መጀመሪያ {{amount}} በYoco መተግበሪያ ወይም በማሽኑ ላይ ተመላሽ ያድርጉ፣ ከዚያ የቦታ ማስያዣው ቀሪ ሂሳብ እና ሪፖርቶች ትክክል ሆነው እንዲቆዩ እዚህ ይመዝግቡት።",
    [`${M}yocoRefundRecordedBody`]: "የYoco ተመላሽ ገንዘቡ በዚህ ቦታ ማስያዣ ላይ ተመዝግቧል።",
    [`${M}awaitingYocoRefundTitle`]: "{{amount}} በYoco ማሽን ላይ ገና ተመላሽ መደረግ አለበት",
    [`${WR}yocoOnMachineTitle`]: "መጀመሪያ በYoco ማሽንዎ ላይ ተመላሽ ያድርጉ",
    [`${WR}yocoOnMachineBody`]:
      "የYoco ተመላሽ ገንዘቦች ከBeautonomi ሊጀመሩ አይችሉም። {{amount}} በYoco መተግበሪያ ወይም በማሽኑ ላይ ተመላሽ ያድርጉ፣ ከዚያ ቀሪ ሂሳቡ እና ሪፖርቶች ትክክል ሆነው እንዲቆዩ እዚህ ይመዝግቡት።",
    [`${WR}yocoRecorded`]: "የYoco ተመላሽ ገንዘብ ተመዝግቧል",
    [`${WR}awaitingYocoTitle`]: "{{amount}} በYoco ማሽን ላይ ገና ተመላሽ መደረግ አለበት",
    [`${RP}subtitle`]: "በጊዜ ክልሉ ውስጥ በመጠባበቅ ላይ ያሉ የYoco ተርሚናል ክፍያዎች እና የPayCloud የመጠን አለመመጣጠኖች",
    [`${RP}unavailableDesc`]: "ይህን ሪፖርት ለመጠቀም የYoco ወይም የBeautonomi ካርድ ማሽኖችን ያንቁ።",
    [`${RP}yocoPending`]: "Yoco በመጠባበቅ ላይ",
    [`${RP}yocoSection`]: "Yoco በመጠባበቅ ላይ",
    [`${RP}awaitingRefunds`]: "በYoco ማሽን ላይ የሚመለስ",
  },
  ar: {
    [`${M}cancelRefundCardHint`]:
      "تعود مدفوعات جهاز البطاقات إلى بطاقة العميل (تلقائيًا لأجهزة Beautonomi؛ أما مع Yoco فتسترد المبلغ على الجهاز ثم تسجّله). تُضاف المدفوعات عبر الإنترنت إلى محفظته.",
    [`${WD}cancelRefundCardHint`]:
      "تعود المبالغ المحصّلة على جهاز البطاقات إلى بطاقة العميل (تلقائيًا لأجهزة Beautonomi؛ أما مع Yoco فتسترد المبلغ على الجهاز ثم تسجّله). يُضاف كل ما دُفع عبر الإنترنت إلى محفظته.",
    [`${C}collectOn`]: "الافتراضي: {{name}}",
    [`${RP}yocoPending`]: "Yoco قيد الانتظار",
    [`${RP}yocoSection`]: "Yoco قيد الانتظار",
  },
  hi: {
    [`${M}cancelRefundWalletHint`]:
      "क्लाइंट को उनके Beautonomi वॉलेट में पूरा रिफ़ंड मिलता है। आपकी रद्दीकरण नीति आपके द्वारा किए गए रद्दीकरण पर लागू नहीं होती।",
    [`${M}cancelWalletNote`]:
      "क्लाइंट को पहले से भुगतान की गई राशि का पूरा रिफ़ंड उनके Beautonomi वॉलेट में मिलेगा। आपकी रद्दीकरण नीति आपके द्वारा किए गए रद्दीकरण पर लागू नहीं होती।",
  },
  fr: {
    [`${M}cancelRefundCardHint`]:
      "Les paiements par terminal de paiement sont remboursés sur la carte du client (automatiquement avec Beautonomi ; avec Yoco, remboursez sur l'appareil puis enregistrez). Les paiements en ligne sont crédités sur son portefeuille.",
    [`${WD}cancelRefundCardHint`]:
      "Les montants encaissés sur une machine à cartes sont remboursés sur la carte du client (automatiquement pour les machines Beautonomi ; pour Yoco, remboursez sur la machine puis enregistrez). Les paiements en ligne sont crédités sur son portefeuille.",
    [`${M}yocoRefundOnMachineBody`]:
      "Les remboursements Yoco ne peuvent pas être lancés depuis Beautonomi. Remboursez d'abord {{amount}} dans l'application Yoco ou sur la machine, puis enregistrez-le ici pour que le solde de la réservation et les rapports restent exacts.",
    [`${WR}yocoOnMachineBody`]:
      "Les remboursements Yoco ne peuvent pas être lancés depuis Beautonomi. Remboursez {{amount}} dans l'application Yoco ou sur la machine, puis enregistrez-le ici pour que le solde et les rapports restent exacts.",
    [`${M}yocoRefundRecordCta`]: "Remboursé sur la machine — enregistrer le remboursement",
    [`${WR}yocoRecordCta`]: "Remboursé sur la machine — enregistrer le remboursement",
    [`${M}yocoRefundRecordedBody`]: "Le remboursement Yoco a été enregistré sur cette réservation.",
    [`${WR}yocoRecorded`]: "Remboursement Yoco enregistré",
    [`${M}refundOriginalHint`]:
      "L'argent est reversé sur la carte du client via la machine à cartes ou la banque. Rien n'est prélevé dans votre caisse.",
    [`${M}refundWalletHint`]:
      "À utiliser lorsque le client n'est pas présent ou a payé en ligne. Le remboursement est crédité sur son portefeuille.",
    [`${M}refundOriginalMachineHint`]:
      "L'argent est reversé sur la carte du client via la machine à cartes utilisée pour le paiement.",
    [`${WR}backToCardHint`]:
      "Reverse l'argent sur la carte du client via la machine à cartes utilisée pour le paiement.",
    [`${WR}sentToCardMachine`]:
      "Remboursement envoyé à la machine à cartes. Suivez les instructions ; la réservation se met à jour après confirmation.",
    [`${C}noMachines`]: "Aucune machine à cartes n'est encore configurée.",
    [`${C}setUp`]: "Configurer les machines à cartes",
    [`${C}retry`]: "Réessayer",
    [`${RP}subtitle`]: "Paiements Yoco en attente et écarts de montant PayCloud sur la période",
    [`${RP}unableToLoad`]: "Impossible de charger les données de rapprochement des machines à cartes",
    [`${RP}unavailableDesc`]: "Activez les machines à cartes Yoco ou Beautonomi pour utiliser ce rapport.",
    [`${RP}totalRows`]: "Lignes sur la période",
    [`${RP}paycloudMismatch`]: "Écart de montant PayCloud",
    [`${RP}paycloudSection`]: "Écarts PayCloud",
    [`${RP}awaitingRefunds`]: "À rembourser sur la machine Yoco",
    [`${RP}awaitingSince`]: "En attente depuis",
  },
  de: {
    [`${M}cancelRefundTo`]: "Gezahlten Betrag erstatten auf",
    [`${WD}cancelRefundTo`]: "Gezahlten Betrag erstatten auf",
    [`${M}cancelRefundCardHint`]:
      "Zahlungen am Kartenterminal gehen auf die Karte des Kunden zurück (bei Beautonomi-Terminals automatisch; bei Yoco erstatten Sie am Gerät und erfassen die Erstattung hier). Online-Zahlungen werden seinem Guthaben gutgeschrieben.",
    [`${WD}cancelRefundCardHint`]:
      "Beträge vom Kartenterminal gehen auf die Karte des Kunden zurück (bei Beautonomi-Terminals automatisch; bei Yoco erstatten Sie am Gerät und erfassen die Erstattung hier). Online bezahlte Beträge werden seinem Guthaben gutgeschrieben.",
    [`${M}yocoRefundOnMachineBody`]:
      "Yoco-Rückerstattungen können nicht über Beautonomi gestartet werden. Erstatten Sie zuerst {{amount}} in der Yoco-App oder am Gerät und erfassen Sie die Erstattung dann hier, damit Buchungssaldo und Berichte korrekt bleiben.",
    [`${WR}yocoOnMachineBody`]:
      "Yoco-Rückerstattungen können nicht über Beautonomi gestartet werden. Erstatten Sie {{amount}} in der Yoco-App oder am Gerät und erfassen Sie die Erstattung dann hier, damit Saldo und Berichte korrekt bleiben.",
    [`${M}yocoRefundRecordCta`]: "Am Gerät erstattet – Erstattung erfassen",
    [`${WR}yocoRecordCta`]: "Am Gerät erstattet – Erstattung erfassen",
    [`${M}yocoRefundRecordedBody`]: "Die Yoco-Rückerstattung wurde bei dieser Buchung erfasst.",
    [`${WR}yocoRecorded`]: "Yoco-Rückerstattung erfasst",
    [`${M}refundWalletHint`]:
      "Verwenden Sie diese Option, wenn der Kunde nicht anwesend ist oder online bezahlt hat. Die Rückerstattung wird seinem Guthaben gutgeschrieben.",
    [`${M}refundCashHint`]:
      "Geben Sie dem Kunden das Geld persönlich zurück. Wird für Ihre Buchhaltung erfasst; es wird kein Guthaben ausgegeben. Der Buchungssaldo wird danach aktualisiert.",
    [`${C}setUp`]: "Kartenterminals einrichten",
    [`${RP}subtitle`]: "Ausstehende Yoco-Terminalzahlungen und PayCloud-Betragsabweichungen im Zeitraum",
    [`${RP}unavailableDesc`]: "Aktivieren Sie Yoco- oder Beautonomi-Kartenterminals, um diesen Bericht zu nutzen.",
    [`${RP}totalRows`]: "Zeilen im Zeitraum",
    [`${RP}paycloudMismatch`]: "PayCloud-Betragsabweichung",
    [`${RP}paycloudSection`]: "PayCloud-Abweichungen",
    [`${RP}match`]: "Betragsabgleich",
    [`${RP}awaitingSince`]: "Offen seit",
    [`${RP}awaitingRefunds`]: "Offen am Yoco-Gerät",
    [`${RP}openBooking`]: "Buchung öffnen und erfassen",
  },
  es: {
    [`${M}yocoRefundRecordCta`]: "Reembolsado en la máquina: registrar el reembolso",
    [`${WR}yocoRecordCta`]: "Reembolsado en la máquina: registrar el reembolso",
    [`${RP}subtitle`]: "Pagos de Yoco pendientes en terminal y discrepancias de importe de PayCloud en el periodo",
    [`${RP}totalRows`]: "Filas en el periodo",
    [`${RP}paycloudMismatch`]: "Discrepancia de importe de PayCloud",
    [`${RP}paycloudSection`]: "Discrepancias de PayCloud",
    [`${RP}match`]: "Coincidencia de importe",
    [`${RP}order`]: "Número de pedido",
    [`${RP}awaitingSince`]: "Pendiente desde",
    [`${RP}openBooking`]: "Abrir la reserva para registrarlo",
    [`${RP}awaitingRefunds`]: "Pendiente en la máquina Yoco",
  },
  pt: {
    [`${M}yocoRefundRecordCta`]: "Reembolsado na máquina — registar o reembolso",
    [`${WR}yocoRecordCta`]: "Reembolsado na máquina — registar o reembolso",
    [`${RP}subtitle`]: "Pagamentos Yoco pendentes no terminal e divergências de valor PayCloud no período",
    [`${RP}totalRows`]: "Linhas no período",
    [`${RP}paycloudMismatch`]: "Divergência de valor PayCloud",
    [`${RP}paycloudSection`]: "Divergências PayCloud",
    [`${RP}awaitingSince`]: "Pendente desde",
    [`${RP}openBooking`]: "Abrir a reserva para registar",
    [`${RP}awaitingRefunds`]: "Pendente na máquina Yoco",
  },
  it: {
    [`${C}setUp`]: "Configura i terminali di pagamento",
    [`${RP}subtitle`]: "Pagamenti Yoco in sospeso sul terminale e discrepanze di importo PayCloud nel periodo",
    [`${RP}totalRows`]: "Righe nel periodo",
    [`${RP}paycloudMismatch`]: "Discrepanza di importo PayCloud",
    [`${RP}awaitingSince`]: "In attesa dal",
    [`${RP}awaitingRefunds`]: "Da rimborsare sul terminale Yoco",
    [`${RP}openBooking`]: "Apri la prenotazione per registrarlo",
  },
  nl: {
    [`${M}yocoRefundRecordCta`]: "Terugbetaald op het apparaat — terugbetaling vastleggen",
    [`${WR}yocoRecordCta`]: "Terugbetaald op het apparaat — terugbetaling vastleggen",
    [`${RP}subtitle`]: "Openstaande Yoco-terminalbetalingen en PayCloud-bedragverschillen in de periode",
    [`${RP}totalRows`]: "Rijen in de periode",
    [`${RP}paycloudMismatch`]: "PayCloud-bedragverschil",
    [`${RP}match`]: "Bedrag komt overeen",
    [`${RP}awaitingSince`]: "Openstaand sinds",
    [`${RP}awaitingRefunds`]: "Open op Yoco-apparaat",
  },
  af: {
    [`${M}cancelRefundCardHint`]:
      "Kaartmasjienbetalings gaan terug na die kliënt se kaart (outomaties vir Beautonomi-masjiene; vir Yoco betaal jy op die masjien terug en teken dit hier aan). Aanlyn betalings word in hul beursie gekrediteer.",
    [`${WD}cancelRefundCardHint`]:
      "Bedrae wat op 'n kaartmasjien ingevorder is, gaan terug na die kliënt se kaart (outomaties vir Beautonomi-masjiene; vir Yoco betaal jy op die masjien terug en teken dit hier aan). Aanlyn betalings word in hul beursie gekrediteer.",
    [`${M}yocoRefundRecordCta`]: "Op die masjien terugbetaal — teken die terugbetaling aan",
    [`${WR}yocoRecordCta`]: "Op die masjien terugbetaal — teken die terugbetaling aan",
    [`${RP}subtitle`]: "Hangende Yoco-terminaalbetalings en PayCloud-bedragverskille in die tydperk",
    [`${RP}totalRows`]: "Rye in die tydperk",
    [`${RP}paycloudMismatch`]: "PayCloud-bedragverskil",
    [`${RP}paycloudSection`]: "PayCloud-verskille",
    [`${RP}link`]: "Bespreking / verkoping",
    [`${RP}match`]: "Bedragooreenstemming",
    [`${RP}awaitingSince`]: "Wag sedert",
  },
  tr: {
    [`${M}cancelRefundTo`]: "Ödenen tutarın iade yeri",
    [`${WD}cancelRefundTo`]: "Ödenen tutarın iade yeri",
    [`${M}yocoRefundRecordCta`]: "Cihazda iade edildi — iadeyi kaydet",
    [`${WR}yocoRecordCta`]: "Cihazda iade edildi — iadeyi kaydet",
    [`${RP}awaitingSince`]: "Bekleme başlangıcı",
    [`${RP}awaitingRefunds`]: "Yoco cihazında iade bekleyen",
  },
};

const setDeep = (obj, key, value) => {
  const parts = key.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
};

for (const [code, map] of Object.entries(overrides)) {
  const file = path.join(dir, `${code}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [k, v] of Object.entries(map)) setDeep(json, k, v);
  safeWriteJson(file, json);
  console.log(`${code}: ${Object.keys(map).length} overrides`);
}
