#!/usr/bin/env node
/**
 * Fix known mobile-gate leftovers (stricter than customer-surfaces audit on short calques).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeWriteJson } from "./_safe-write-json.mjs";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");

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

/** @type {Record<string, Record<string, string>>} */
const BY_LOCALE = {
  fr: {
    "booking.noSlotsTryAnother": "Aucun créneau disponible. Choisissez une autre date.",
    "provider.mobile.screens.subscriptionSettings.billedThroughStripeTitle": "Facturé via Stripe",
    "provider.mobile.screens.subscriptionSettings.billedThroughStripeBody":
      "Mettez à jour votre carte ou consultez vos factures dans le portail de facturation Stripe sécurisé. Touchez Gérer la facturation ci-dessous.",
    "provider.mobile.screens.subscriptionSettings.stripeManageUnavailable":
      "La facturation Stripe n’est pas encore configurée. Terminez d’abord le paiement, puis réessayez.",
    "provider.mobile.screens.subscriptionSettings.paystackManageUnavailable":
      "Ce forfait n’utilise pas la facturation récurrente Paystack. Terminez le paiement ou contactez l’assistance.",
    "provider.mobile.screens.moreTab.payoutCompleteStripeConnectFirst":
      "Terminez d’abord la configuration des versements Stripe Connect",
    "provider.mobile.screens.moreTab.stripeConnectReady": "Stripe Connect prêt pour les versements",
    "provider.mobile.screens.moreTab.stripeConnectLast4": "Compte Stripe ···· {{last4}}",
    "provider.mobile.screens.paymentSetup.hintPaystackTerminal":
      "Paystack Terminal : encaissez sur votre téléphone avec un code QR.",
    "provider.mobile.screens.payoutAccounts.stripeConnectTitle": "Stripe Connect",
    "provider.mobile.screens.payoutAccounts.stripeConnectSubtitle":
      "Configurez les versements via Stripe. Votre banque est ajoutée sur la page d’inscription sécurisée de Stripe.",
    "provider.mobile.screens.payoutAccounts.stripeConnectReady": "Prêt pour les versements",
    "provider.mobile.screens.payoutAccounts.stripeConnectStart": "Connecter avec Stripe",
    "provider.mobile.screens.payoutAccounts.stripeConnectBankLast4": "Banque ···· {{last4}}",
    "provider.mobile.screens.twilioIntegration.whatsappCampaignLimitHint":
      "WhatsApp exige le consentement de l’utilisateur. Le texte libre de campagne ne fonctionne que dans les 24 h suivant un message de l’utilisateur ; sinon Meta exige des modèles Twilio Content approuvés. Les tests d’intégration peuvent réussir en bac à sable, pas les envois massifs hors ces règles.",
    "customer.mobile.tabs.explore.searchPlaceholder": "Rechercher looks, styles, soins…",
    "customer.mobile.screens.productOrders.emptyBody": "Vos commandes produits s’afficheront ici",
    "customer.mobile.screens.recurringBookings.invalidPreferredTime":
      "Saisissez une heure valide au format HH:MM (ex. 10:30).",
    "customer.mobile.screens.customRequestsList.noPaymentLinkBody":
      "Aucun lien de paiement n’a été renvoyé. Veuillez réessayer.",
    "customer.mobile.screens.bookingDetail.runningLateSentBody":
      "Le prestataire a été informé que vous êtes en retard.",
    "customer.mobile.screens.bookingDetail.paymentLinkNotReceived":
      "Le lien de paiement n’a pas été reçu. Veuillez réessayer.",
    "customer.mobile.screens.safetyHub.ageBand.13_17":
      "13–17 — paramètres de sécurité adolescents appliqués",
    "customer.mobile.screens.help.learningCentreA11y": "Ouvrir les articles du centre d’apprentissage",
    "customer.mobile.screens.taxes.documentsLoadFailed": "Impossible de charger la liste des documents fiscaux.",
    "customer.mobile.screens.taxes.documentsLoadErrorEmpty": "Impossible de charger la liste des documents.",
    "customer.mobile.screens.taxes.downloadHintA11y":
      "Ouvre le PDF ou le fichier dans votre navigateur",
    "customer.mobile.screens.personalInfo.photoUploadedProfileFailed":
      "Photo téléversée, mais le profil n’a pas pu être mis à jour. Veuillez réessayer.",
    "customer.mobile.screens.personalInfo.aboutMeUpdateFailed":
      "Profil enregistré, mais « À propos de moi » n’a pas pu être mis à jour.",
    "customer.mobile.screens.notificationPreferences.messagePushLabel":
      "Alertes push pour les messages",
    "customer.mobile.screens.partnerProfile.paymentLinkError":
      "Impossible de créer le lien de paiement. Veuillez réessayer.",
    "customer.mobile.screens.partnerProfile.exactAddressAfterBooking":
      "Adresse exacte disponible après confirmation de la réservation",
    "customer.mobile.screens.partnerProfile.signInToReadAbout":
      "Connectez-vous pour lire la description complète, les horaires et l’emplacement.",
    "customer.mobile.screens.partnerProfile.membershipPaidWallet":
      "Abonnement payé depuis votre portefeuille.",
    "customer.mobile.screens.partnerProfile.failedMembershipPurchase":
      "Impossible de démarrer l’achat d’abonnement",
    "customer.mobile.screens.partnerProfile.giftCardsBody":
      "Achetez une carte cadeau pour de futures visites chez ce prestataire. Les cartes cadeaux peuvent être utilisées pour tout service ou réservation.",
    "customer.mobile.screens.partnerProfile.noDescriptionForService":
      "Aucune description disponible pour ce service.",
    "customer.mobile.screens.partnerProfile.pleaseProvideSlug":
      "Veuillez indiquer un identifiant prestataire.",
    "checkout.noMatchingPackages": "Aucun forfait ne correspond à votre recherche.",
    "checkout.redeemPackage": "Utiliser un forfait prépayé (facultatif)",
    "checkout.holdExpiredFallback": "La réservation temporaire a expiré. Choisissez un nouvel horaire.",
    "checkout.promoValidateFailed": "Impossible de valider le code promo",
    "checkout.invalidServerResponse": "Réponse serveur invalide",
    "web.global.cityWaitlist.notesPlaceholder": "Dites-nous en plus sur votre intérêt…",
  },
  ar: {
    "booking.noSlotsTryAnother": "لا توجد مواعيد متاحة. جرّب تاريخاً آخر.",
    "provider.mobile.screens.subscriptionSettings.billedThroughStripeTitle": "تتم الفوترة عبر Stripe",
    "provider.mobile.screens.subscriptionSettings.billedThroughStripeBody":
      "حدّث بطاقتك أو اعرض الفواتير في بوابة الفوترة الآمنة لـ Stripe. اضغط «إدارة الفوترة» أدناه.",
    "provider.mobile.screens.subscriptionSettings.stripeManageUnavailable":
      "لم يتم إعداد فوترة Stripe بعد. أكمل الدفع أولاً ثم حاول مرة أخرى.",
    "provider.mobile.screens.subscriptionSettings.paystackManageUnavailable":
      "هذه الخطة ليست على فوترة Paystack المتكررة. أكمل الدفع أو تواصل مع الدعم.",
    "provider.mobile.screens.moreTab.payoutCompleteStripeConnectFirst":
      "أكمل إعداد مدفوعات Stripe Connect أولاً",
    "provider.mobile.screens.moreTab.stripeConnectReady": "Stripe Connect جاهز للمدفوعات",
    "provider.mobile.screens.moreTab.stripeConnectLast4": "Stripe ···· {{last4}}",
    "provider.mobile.screens.paymentSetup.hintPaystackTerminal":
      "Paystack Terminal: استلم الدفع على هاتفك برمز QR.",
    "provider.mobile.screens.payoutAccounts.stripeConnectSubtitle":
      "أعد المدفوعات عبر Stripe. يُضاف بنكك في صفحة التسجيل الآمنة لدى Stripe.",
    "provider.mobile.screens.payoutAccounts.stripeConnectReady": "جاهز للمدفوعات",
    "provider.mobile.screens.payoutAccounts.stripeConnectStart": "الاتصال بـ Stripe",
    "provider.mobile.screens.payoutAccounts.stripeConnectBankLast4": "بنك ···· {{last4}}",
    "provider.mobile.screens.twilioIntegration.whatsappCampaignLimitHint":
      "يتطلب WhatsApp موافقة المستخدم. نص الحملات الحر يعمل فقط خلال 24 ساعة بعد رسالة المستخدم؛ وإلا تتطلب Meta قوالب Twilio Content المعتمدة. قد تنجح اختبارات التكامل في بيئة تجريبية، بينما تفشل الحملات الجماعية خارج ذلك.",
    "customer.mobile.screens.recurringBookings.invalidPreferredTime":
      "أدخل وقتاً صالحاً بصيغة HH:MM (مثل 10:30).",
    "customer.mobile.screens.customRequestsList.noPaymentLinkBody":
      "لم يُرجَع رابط دفع. يرجى المحاولة مرة أخرى.",
    "customer.mobile.screens.bookingDetail.runningLateSentBody":
      "تم إبلاغ مزود الخدمة أنك متأخر.",
    "customer.mobile.screens.bookingDetail.paymentLinkNotReceived":
      "لم يُستلَم رابط الدفع. يرجى المحاولة مرة أخرى.",
    "customer.mobile.screens.taxes.downloadHintA11y": "يفتح ملف PDF أو الملف في متصفحك",
    "customer.mobile.screens.personalInfo.photoUploadedProfileFailed":
      "تم رفع الصورة، لكن تعذّر تحديث الملف الشخصي. يرجى المحاولة مرة أخرى.",
    "customer.mobile.screens.personalInfo.aboutMeUpdateFailed":
      "تم حفظ الملف الشخصي، لكن تعذّر تحديث «نبذة عني».",
    "customer.mobile.screens.partnerProfile.paymentLinkError":
      "تعذّر إنشاء رابط الدفع. يرجى المحاولة مرة أخرى.",
    "customer.mobile.screens.partnerProfile.exactAddressAfterBooking":
      "العنوان الدقيق متاح بعد تأكيد الحجز",
    "customer.mobile.screens.partnerProfile.signInToReadAbout":
      "سجّل الدخول لقراءة الوصف الكامل وأوقات العمل وتفاصيل الموقع.",
    "customer.mobile.screens.partnerProfile.membershipPaidWallet": "تم دفع الاشتراك من محفظتك.",
    "customer.mobile.screens.partnerProfile.failedMembershipPurchase": "تعذّر بدء شراء الاشتراك",
    "customer.mobile.screens.partnerProfile.giftCardsBody":
      "اشترِ بطاقة هدايا لزيارات مستقبلية لدى هذا المزود. يمكن استخدام بطاقات الهدايا لأي خدمة أو حجز.",
    "customer.mobile.screens.partnerProfile.pleaseProvideSlug": "يرجى تقديم معرّف مزود الخدمة.",
    "checkout.redeemPackage": "استخدم باقة مدفوعة مسبقاً (اختياري)",
    "checkout.holdExpiredFallback": "انتهت صلاحية الحجز المؤقت. يرجى اختيار وقت جديد.",
  },
  af: {
    "provider.mobile.screens.subscriptionSettings.billedThroughStripeTitle": "Gefaktureer deur Stripe",
    "provider.mobile.screens.subscriptionSettings.billedThroughStripeBody":
      "Dateer jou kaart op of sien fakture in die veilige Stripe-faktureringsportaal. Tik Bestuur fakturering hieronder.",
    "provider.mobile.screens.subscriptionSettings.paystackManageUnavailable":
      "Hierdie plan is nie op Paystack-herhalende fakturering nie. Voltooi afhandeling of kontak ondersteuning.",
    "provider.mobile.screens.moreTab.payoutCompleteStripeConnectFirst":
      "Voltooi eers Stripe Connect-uitbetaling-opstelling",
    "provider.mobile.screens.payoutAccounts.stripeConnectSubtitle":
      "Stel uitbetalings deur Stripe op. Jou bank word bygevoeg op Stripe se veilige onboarding-bladsy.",
    "provider.mobile.screens.payoutAccounts.stripeConnectBankLast4": "Bankrekening ···· {{last4}}",
    "provider.mobile.screens.moreTab.stripeConnectLast4": "Stripe-koppel ···· {{last4}}",
    "provider.mobile.screens.twilioIntegration.whatsappCampaignLimitHint":
      "WhatsApp vereis toestemming van die gebruiker. Vrye veldtogte werk net binne 24 uur nadat ’n gebruiker jou boodskap het; anders benodig Meta goedgekeurde Twilio-inhoudsjablone. Integrasietoets kan in sandbox slaag, maar grootmaat veldtogte misluk buite hierdie reëls.",
  },
};

const SA_DONOR = "af";
const SA = ["xh", "st", "nso", "tn", "ts", "ve", "ss"];
const donorKeys = BY_LOCALE[SA_DONOR];
for (const loc of SA) {
  BY_LOCALE[loc] = { ...(BY_LOCALE[loc] ?? {}), ...donorKeys };
}

for (const [locale, keys] of Object.entries(BY_LOCALE)) {
  const fp = path.join(localesDir, `${locale}.json`);
  if (!fs.existsSync(fp)) continue;
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  let n = 0;
  for (const [k, v] of Object.entries(keys)) {
    deepSet(data, k, v);
    n += 1;
  }
  safeWriteJson(fp, data);
  console.log(`${locale}: mobile-gate patch ${n} keys`);
}
