#!/usr/bin/env node
/** Translate remaining mobile leftover keys introduced by i18n missing-keys patch. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { translate as translateSa } from "./_wave-a-translate.mjs";
import { translate as translateFrArSw } from "./_wave-a-fr-ar-sw.mjs";
import { stillMostlyEnglish } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");

const TARGET = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "fr", "ar"];

/** Copy from customer.mobile when provider string is still English. */
const CUSTOMER_MIRROR = {
  "provider.mobile.screens.contentSafety.reportingHint":
    "customer.mobile.screens.contentSafety.reportingHint",
  "provider.mobile.screens.contentSafety.ageBandNote": "customer.mobile.screens.contentSafety.ageBandNote",
  "provider.mobile.screens.contentSafety.authPrompt": "customer.mobile.screens.contentSafety.authPrompt",
  "provider.mobile.screens.contentSafety.lockedNote": "customer.mobile.screens.contentSafety.lockedNote",
  "provider.mobile.screens.reportUser.title": "customer.mobile.screens.reportUser.title",
  "provider.mobile.screens.reportUser.breadcrumb": "customer.mobile.screens.reportUser.breadcrumb",
  "provider.mobile.screens.reportUser.intro": "customer.mobile.screens.reportUser.intro",
  "provider.mobile.screens.reportUser.identifierLabel": "customer.mobile.screens.reportUser.identifierLabel",
  "provider.mobile.screens.reportUser.identifierPlaceholder":
    "customer.mobile.screens.reportUser.identifierPlaceholder",
  "provider.mobile.screens.reportUser.identifierHint": "customer.mobile.screens.reportUser.identifierHint",
  "provider.mobile.screens.reportUser.descriptionLabel": "customer.mobile.screens.reportUser.descriptionLabel",
  "provider.mobile.screens.reportUser.descriptionPlaceholder":
    "customer.mobile.screens.reportUser.descriptionPlaceholder",
  "provider.mobile.screens.reportUser.submit": "customer.mobile.screens.reportUser.submit",
  "provider.mobile.screens.reportUser.submittedTitle": "customer.mobile.screens.reportUser.submittedTitle",
  "provider.mobile.screens.reportUser.submittedBody": "customer.mobile.screens.reportUser.submittedBody",
  "provider.mobile.screens.reportUser.submitFailedTitle": "customer.mobile.screens.reportUser.submitFailedTitle",
  "provider.mobile.screens.reportUser.submitGenericError":
    "customer.mobile.screens.reportUser.submitGenericError",
};

const MANUAL = {
  "provider.mobile.screens.reportUser.intro": {
    fr: "Les signalements vont à notre équipe confiance et sécurité. Indiquez qui vous signalez et ce qui s’est passé. Danger urgent ? Appelez d’abord les urgences, puis contactez l’assistance Partenaire.",
    ar: "تُرسل البلاغات إلى فريق الثقة والسلامة. اذكر من تبلّغ عنه وما حدث. خطر عاجل؟ اتصل بالطوارئ أولاً، ثم تواصل مع دعم الشركاء.",
  },
  "provider.mobile.screens.reportUser.identifierHint": {
    fr: "Utilisez le @identifiant du profil de la personne, ou son ID utilisateur si vous l’avez depuis une réservation ou une conversation.",
    ar: "استخدم @المعرّف من ملف الشخص، أو معرّف المستخدم إن كان لديك من حجز أو محادثة.",
  },
  "provider.mobile.screens.reportUser.submittedBody": {
    fr: "Notre équipe confiance et sécurité examinera votre signalement. Nous pourrons vous contacter si nous avons besoin de précisions.",
    ar: "سيراجع فريق الثقة والسلامة بلاغك. قد نتواصل معك إذا احتجنا مزيداً من المعلومات.",
  },
  "provider.mobile.screens.reportUser.supportFallback": {
    fr: "Vous ne connaissez pas l’identifiant ? Ouvrez plutôt un ticket d’assistance Partenaire",
    ar: "لا تعرف المعرّف؟ افتح تذكرة دعم للشركاء بدلاً من ذلك",
  },
  "provider.mobile.screens.reportUser.submitFailedFallback": {
    fr: "Veuillez réessayer ou contacter l’assistance Partenaire.",
    ar: "يُرجى المحاولة مرة أخرى أو التواصل مع دعم الشركاء.",
  },
  "provider.mobile.screens.inAppBrowser.continueToSetupHub": {
    fr: "Votre paiement d’abonnement est confirmé. Continuez vers le hub de configuration pour finaliser le lancement de votre activité sur Beautonomi.",
    ar: "تم تأكيد دفع خطتك. تابع إلى مركز الإعداد لإكمال إطلاق نشاطك على Beautonomi.",
  },
  "provider.mobile.screens.inAppBrowser.goToSetupHub": {
    fr: "Aller au hub de configuration",
    ar: "الانتقال إلى مركز الإعداد",
  },
  "provider.mobile.components.bookingCreateReadiness.participant": {
    fr: "Participant·e {{number}}",
    ar: "مشارك {{number}}",
  },
  "provider.mobile.components.bookingCreateReadiness.items.booking_staff": {
    fr: "Attribution de l’équipe",
    ar: "تعيين الفريق",
  },
};

function get(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

function set(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function translateEn(enStr, locale) {
  const sa = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
  if (sa.includes(locale)) return translateSa(enStr, locale) ?? enStr;
  if (["fr", "ar", "sw"].includes(locale)) return translateFrArSw(enStr, locale) ?? enStr;
  return enStr;
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));

const keys = new Set([
  ...Object.keys(CUSTOMER_MIRROR),
  ...Object.keys(MANUAL),
  "provider.mobile.screens.inAppBrowser.continueToSetupHub",
  "provider.mobile.screens.inAppBrowser.goToSetupHub",
  "provider.mobile.components.bookingCreateReadiness.participant",
  "provider.mobile.components.bookingCreateReadiness.items.booking_staff",
]);

for (const locale of TARGET) {
  const file = path.join(localesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const keyPath of keys) {
    const enVal = get(en, keyPath);
    if (typeof enVal !== "string") continue;
    const cur = get(data, keyPath);
    if (cur != null && !stillMostlyEnglish(enVal, cur)) continue;

    let next = MANUAL[keyPath]?.[locale];
    if (!next) {
      const mirror = CUSTOMER_MIRROR[keyPath];
      if (mirror) {
        const fromCustomer = get(data, mirror);
        if (fromCustomer && !stillMostlyEnglish(enVal, fromCustomer)) {
          next = fromCustomer;
          if (keyPath.includes("reportUser") && locale === "fr") {
            next = next.replace(/contact(?:er)? confiance et sécurité/i, "contactez l’assistance Partenaire");
            next = next.replace(/support ticket/i, "ticket d’assistance Partenaire");
          }
        }
      }
    }
    if (!next || stillMostlyEnglish(enVal, next)) {
      next = translateEn(enVal, locale);
    }
    if (MANUAL[keyPath]?.[locale]) next = MANUAL[keyPath][locale];
    if (next && next !== cur) set(data, keyPath, next);
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log("finished", locale);
}

const r = spawnSync(process.execPath, ["scripts/leftover-tr-mobile-apps.mjs", "--report"], {
  cwd: path.join(__dirname, ".."),
  encoding: "utf8",
});
process.stdout.write(r.stdout || "");
