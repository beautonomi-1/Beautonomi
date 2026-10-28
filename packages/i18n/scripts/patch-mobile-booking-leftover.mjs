#!/usr/bin/env node
/** Fix leftover-English keys introduced by booking/wallet i18n (mobile gate locales). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeWriteJson } from "./_safe-write-json.mjs";

const LOCALES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");

const SA_LIFECYCLE = {
  af: {
    "customer.mobile.components.groupBookingPayment.partial": "Gedeeltelik",
    "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider":
      "Jou bespreking wag op bevestiging van {{name}}.",
    "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider":
      "{{name}} moet nog hierdie afspraak aan hulle kant afrond.",
    "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription":
      "Jou deposito is ontvang. Die res van die bedrag is later betaalbaar.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription":
      "’n Gedeeltelike betaling is ontvang.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription":
      "’n Gedeeltelike terugbetaling is vir hierdie bespreking aangeteken.",
    "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription":
      "Die betaling het nie deurgegaan nie. Probeer weer of kontak ondersteuning met hierdie besprekingsnommer.",
  },
  zu: {
    "customer.mobile.components.groupBookingPayment.partial": "Ingxenye",
    "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider":
      "Ukubhuka kwakho kulinda ukuqinisekiswa ku-{{name}}.",
    "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider":
      "U-{{name}} usadinga ukuqedela leli sikhathi ngasohlangothini lwabo.",
    "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription":
      "Idiphozithi yakho itholiwe. Inani elisele lizokhokhelwa kamuva.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription":
      "Inkokhelo engxenye itholiwe.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription":
      "Kubhalwe ukubuyiselwa kwezingxenye kwaleli bhukingi.",
    "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription":
      "Inkokhelo ayiphumelelanga. Zama futhi, noma uxhumane nosekelo ngenombolo yaleli bhukingi.",
  },
  xh: {
    "customer.mobile.components.groupBookingPayment.partial": "Inxenye",
    "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider":
      "Ukubhukisha kwakho kulindile ukuqinisekiswa ngu-{{name}}.",
    "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider":
      "U-{{name}} usafuneka ukugqiba le mihla ngakule cala.",
    "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription":
      "Idiphozithi yakho ifunyenwe. Ibhalansi eshiyekileyo iya kuhlawulwa kamva.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription":
      "Kufunyenwe intlawulo yinxenye.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription":
      "Kubhalwe ukubuyiselwa kwe ngxenye kwale bhuking.",
    "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription":
      "Intlawulo ayiphumelelanga. Zama kwakhona okanye uqhagamshelane nenkxaso ngenombolo yale bhuking.",
  },
  st: {
    "customer.mobile.components.groupBookingPayment.partial": "Karolo",
    "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider":
      "Ho buka ha hao ho emetse netefatso ho tsoa ho {{name}}.",
    "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider":
      "{{name}} e ntse e hloka ho phetha kopano ena ka lehlakore la bona.",
    "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription":
      "Depositi ea hau e amohetsoe. Chelete e setseng e tla lefuoa hamorao.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription":
      "Chelete e karolo e amohetsoe.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription":
      "Ho ngoliloe ho khutlisetsoa ha karolo bakeng sa ho buka hona.",
    "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription":
      "Tefo ha ea atle. Leka hape kapa ikopanye le tšehetso ka nomoro ea ho buka ena.",
  },
  nso: {
    "customer.mobile.components.groupBookingPayment.partial": "Karolo",
    "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider":
      "Peakanyo ya gago e emetše tišitšo go tšwa go {{name}}.",
    "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider":
      "{{name}} o sa ntse a nyaka go phetha kopano ye ka lehlakore la gagwe.",
    "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription":
      "Depositi ya gago e amogetšwe. Tekanyo e setseng e tla lefišwa ka morago.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription":
      "Tefo ya karolo e amogetšwe.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription":
      "Go ngwadilwe go bušetšwa ga karolo bakeng sa peakanyo ye.",
    "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription":
      "Tefo e paletšwe. Leka gape goba ikopanye le thekgo ka nomoro ya peakanyo ye.",
  },
  tn: {
    "customer.mobile.components.groupBookingPayment.partial": "Karolo",
    "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider":
      "Peakanyo ya gago e emetse tišitšo go tswa go {{name}}.",
    "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider":
      "{{name}} o sa ntse a tlhoka go wetsa kopano eno ka lehlakore la gagwe.",
    "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription":
      "Depositi ya gago e amogetse. Tekanyo e setseng e tla duelelwa morago.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription":
      "Tefo ya karolo e amogetse.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription":
      "Go kwadilwe go busetswa ga karolo mo peakanyong eno.",
    "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription":
      "Tefo e paletswe. Leka gape kgotsa ikopanye le thekgo ka nomoro ya peakanyo eno.",
  },
  ts: {
    "customer.mobile.components.groupBookingPayment.partial": "Xiphemu",
    "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider":
      "Vuhlanganisi bya wena byi yimela ku tiyisiswa hi {{name}}.",
    "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider":
      "{{name}} a swi koteki ku hetisa nhlengelelo lowu hi side ya vona.",
    "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription":
      "Depositi ya wena yi amukeriwile. Avelo laha nga riki na yona yi ta hakeriwa endzhaku.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription":
      "Ku amukeriwile hakelo ya xiphemu.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription":
      "Ku tsariwile ku tlheriseriwa ka xiphemu eka vuhlanganisi lebyi.",
    "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription":
      "Hakelo a yi nghenanga. Ringeta nakambe kumbe tihlanganise na nseketelo hi nomboro ya vuhlanganisi lebyi.",
  },
  ve: {
    "customer.mobile.components.groupBookingPayment.partial": "Tshifhinganyana",
    "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider":
      "U bukwa hwaṋu hu tshi lindela u khwathisedzwa u bva kha {{name}}.",
    "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider":
      "{{name}} u sa khou toda u fhedza tshifhinga tshe nga side yawe.",
    "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription":
      "Depositi yawe yo wano. Tshalo tshi salaho tshi do bvelwa murahu.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription":
      "Mvelelo ya tshifhinganyana yo wano.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription":
      "Ho tsalelwa u vhuyelwa ha tshifhinganyana kha u bukwa uhu.",
    "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription":
      "Mvelelo a yo bvisa. Lingedza hafhu kana vhudzisane na thuso nga nomboro ya u bukwa heyi.",
  },
  ss: {
    "customer.mobile.components.groupBookingPayment.partial": "Ingxenye",
    "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider":
      "Kubhuka kwakho kuyalindela kuqinisekiswa ngu-{{name}}.",
    "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider":
      "U-{{name}} usafuneka kuphelela le sikhatsi ngalendzawo yabo.",
    "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription":
      "Idiphozithi yakho itholiwe. Inani lelishiyekile litawuhlawulwa kamuva.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription":
      "Kutholiwe inkokhelo lengenye.",
    "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription":
      "Kubhalwe kubuyiselwa kwengenye kuleli bhukingi.",
    "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription":
      "Inkokhelo ayiphumelelanga. Zama futsi, noma uxhumane nosekelo ngenombolo yaleli bhukingi.",
  },
};

const FR = {
  "customer.mobile.components.groupBookingPayment.partial": "Partiel",
  "customer.mobile.components.groupBookingPayment.partiallyRefunded": "Partiellement remboursé",
  "customer.mobile.components.groupBookingPayment.notInvoiced": "Non facturé",
  "customer.mobile.screens.bookingDetail.paymentStatusPartiallyRefunded": "Partiellement remboursé",
  "customer.mobile.screens.bookingDetail.depositPaid": "Acompte payé",
  "customer.mobile.screens.bookingDetail.lifecyclePaymentPendingDescription":
    "Votre demande de réservation attend la confirmation du paiement.",
  "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider":
    "Votre réservation attend la confirmation de {{name}}.",
  "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider":
    "{{name}} doit encore finaliser ce rendez-vous de son côté.",
  "customer.mobile.screens.bookingDetail.lifecycleCompletedDescription":
    "Votre prestation est terminée.",
  "customer.mobile.screens.bookingDetail.lifecycleNoShowDescription":
    "Ce rendez-vous a été marqué comme absence.",
  "customer.mobile.screens.bookingDetail.lifecycleInProgressDescription":
    "Votre prestataire a commencé cette prestation.",
  "customer.mobile.screens.bookingDetail.lifecyclePayAtAppointmentDescription":
    "Le paiement sera collecté lors du rendez-vous.",
  "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription":
    "Votre acompte a été reçu. Le solde restant sera dû plus tard.",
  "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription":
    "Un paiement partiel a été reçu.",
  "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription":
    "Un remboursement partiel a été enregistré pour cette réservation.",
  "customer.mobile.screens.bookingDetail.lifecycleRefundedDescription":
    "Le paiement de cette réservation a été remboursé.",
  "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription":
    "Le paiement n’a pas abouti. Réessayez ou contactez l’assistance avec ce numéro de réservation.",
};

const AR = {
  "customer.mobile.components.groupBookingPayment.partial": "جزئي",
  "customer.mobile.components.groupBookingPayment.partiallyRefunded": "مسترد جزئياً",
  "customer.mobile.components.groupBookingPayment.notInvoiced": "غير مفوتر",
  "customer.mobile.screens.bookingDetail.paymentStatusPartiallyRefunded": "مسترد جزئياً",
  "customer.mobile.screens.bookingDetail.depositPaid": "تم دفع العربون",
  "customer.mobile.screens.bookingDetail.lifecyclePaymentPendingDescription":
    "طلب الحجز بانتظار تأكيد الدفع.",
  "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider":
    "حجزك بانتظار التأكيد من {{name}}.",
  "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider":
    "لا يزال على {{name}} إتمام هذا الموعد من جانبه.",
  "customer.mobile.screens.bookingDetail.lifecycleNoShowDescription":
    "تم تسجيل هذا الموعد كعدم حضور.",
  "customer.mobile.screens.bookingDetail.lifecycleInProgressDescription":
    "بدأ مقدّم الخدمة هذه الخدمة.",
  "customer.mobile.screens.bookingDetail.lifecyclePayAtAppointmentDescription":
    "سيتم تحصيل الدفع في الموعد.",
  "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription":
    "تم استلام العربون. يُستحق الرصيد المتبقي لاحقاً.",
  "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription":
    "تم استلام دفعة جزئية.",
  "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription":
    "سُجّل استرداد جزئي لهذا الحجز.",
  "customer.mobile.screens.bookingDetail.lifecycleRefundedDescription":
    "تم استرداد دفعة هذا الحجز.",
  "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription":
    "لم ينجح الدفع. أعد المحاولة أو تواصل مع الدعم برقم هذا الحجز.",
};

const LOCALE_FIXES = { ...SA_LIFECYCLE, fr: FR, ar: AR };

function deepSet(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

for (const [locale, fixes] of Object.entries(LOCALE_FIXES)) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  for (const [keyPath, val] of Object.entries(fixes)) {
    deepSet(data, keyPath, val);
  }
  safeWriteJson(localePath, data);
  console.log(`${locale}: patched ${Object.keys(fixes).length} keys`);
}
