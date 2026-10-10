import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
function writeJsonWithRetry(filePath, data, attempts = 5) {
  const payload = JSON.stringify(data, null, 2) + "\n";
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      fs.writeFileSync(filePath, payload, "utf8");
      return;
    } catch (err) {
      lastErr = err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250 * (i + 1));
    }
  }
  throw lastErr;
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "packages/i18n/src/locales");

const keys = {
  stripeConnectTitle: "Stripe Connect",
  stripeConnectSubtitle:
    "Set up payouts through Stripe. Your bank is added on Stripe's secure onboarding page.",
  stripeConnectReady: "Ready for payouts",
  stripeConnectReadyHint: "Payouts will be sent to the bank account on your Stripe Connect account.",
  stripeConnectIncomplete: "Setup incomplete",
  stripeConnectIncompleteHint: "Finish Stripe onboarding so payouts can be sent to your bank.",
  stripeConnectNotStarted: "Stripe Connect not set up",
  stripeConnectNotStartedHint:
    "Connect with Stripe to receive payouts. You will add your bank on Stripe's secure onboarding page.",
  stripeConnectContinue: "Continue setup",
  stripeConnectStart: "Connect with Stripe",
  stripeConnectBankLast4: "Bank ···· {{last4}}",
  stripeConnectFailed: "Could not open Stripe Connect. Try again.",
  stripeConnectReturnSuccess:
    "Stripe Connect updated. Complete any remaining steps if setup is still incomplete.",
};

const translations = {
  af: {
    stripeConnectTitle: "Stripe Connect",
    stripeConnectSubtitle:
      "Stel uitbetalings deur Stripe op. Jou bank word bygevoeg op Stripe se veilige onboarding-bladsy.",
    stripeConnectReady: "Gereed vir uitbetalings",
    stripeConnectReadyHint: "Uitbetalings word na die bankrekening op jou Stripe Connect-rekening gestuur.",
    stripeConnectIncomplete: "Opstelling onvoltooid",
    stripeConnectIncompleteHint: "Voltooi Stripe-onboarding sodat uitbetalings na jou bank gestuur kan word.",
    stripeConnectNotStarted: "Stripe Connect is nie opgestel nie",
    stripeConnectNotStartedHint:
      "Koppel met Stripe om uitbetalings te ontvang. Jy voeg jou bank by op Stripe se veilige onboarding-bladsy.",
    stripeConnectContinue: "Gaan voort met opstelling",
    stripeConnectStart: "Koppel met Stripe",
    stripeConnectBankLast4: "Bank ···· {{last4}}",
    stripeConnectFailed: "Kon nie Stripe Connect oopmaak nie. Probeer weer.",
    stripeConnectReturnSuccess:
      "Stripe Connect is bygewerk. Voltooi enige oorblywende stappe as opstelling nog onvoltooid is.",
  },
  zu: {
    stripeConnectTitle: "Stripe Connect",
    stripeConnectSubtitle:
      "Setha ukukhokhwa nge-Stripe. Ibhange lakho lengezwa ekhasini eliphephile le-Stripe.",
    stripeConnectReady: "Kulungele ukukhokhwa",
    stripeConnectReadyHint:
      "Ukukhokhwa kuzothunyelwa ku-akhawunti yasebhange ku-akhawunti yakho ye-Stripe Connect.",
    stripeConnectIncomplete: "Ukusetha akuqediwe",
    stripeConnectIncompleteHint:
      "Qedela ukubhaliswa kwe-Stripe ukuze ukukhokhwa kuthunyelwe ebhange lakho.",
    stripeConnectNotStarted: "I-Stripe Connect ayisethiwe",
    stripeConnectNotStartedHint:
      "Xhuma ne-Stripe ukuze uthole ukukhokhwa. Uzogeza ibhange lakho ekhasini eliphephile le-Stripe.",
    stripeConnectContinue: "Qhubeka nokusetha",
    stripeConnectStart: "Xhuma ne-Stripe",
    stripeConnectBankLast4: "Ibhange ···· {{last4}}",
    stripeConnectFailed: "Ayikwazanga ukuvula i-Stripe Connect. Zama futhi.",
    stripeConnectReturnSuccess:
      "I-Stripe Connect ibuyekeziwe. Qedela izinyathelo ezisele uma ukusetha kusaqediwe.",
  },
  fr: {
    stripeConnectTitle: "Stripe Connect",
    stripeConnectSubtitle:
      "Configurez les versements via Stripe. Votre banque est ajoutée sur la page d’inscription sécurisée de Stripe.",
    stripeConnectReady: "Prêt pour les versements",
    stripeConnectReadyHint:
      "Les versements seront envoyés au compte bancaire de votre compte Stripe Connect.",
    stripeConnectIncomplete: "Configuration incomplète",
    stripeConnectIncompleteHint:
      "Terminez l’inscription Stripe pour que les versements puissent être envoyés à votre banque.",
    stripeConnectNotStarted: "Stripe Connect n’est pas configuré",
    stripeConnectNotStartedHint:
      "Connectez-vous à Stripe pour recevoir des versements. Vous ajouterez votre banque sur la page d’inscription sécurisée de Stripe.",
    stripeConnectContinue: "Continuer la configuration",
    stripeConnectStart: "Connecter avec Stripe",
    stripeConnectBankLast4: "Banque ···· {{last4}}",
    stripeConnectFailed: "Impossible d’ouvrir Stripe Connect. Réessayez.",
    stripeConnectReturnSuccess:
      "Stripe Connect mis à jour. Terminez les étapes restantes si la configuration est encore incomplète.",
  },
  ar: {
    stripeConnectTitle: "Stripe Connect",
    stripeConnectSubtitle: "أعد المدفوعات عبر Stripe. يُضاف بنكك في صفحة التسجيل الآمنة لدى Stripe.",
    stripeConnectReady: "جاهز للمدفوعات",
    stripeConnectReadyHint: "ستُرسل المدفوعات إلى الحساب البنكي في حساب Stripe Connect الخاص بك.",
    stripeConnectIncomplete: "الإعداد غير مكتمل",
    stripeConnectIncompleteHint: "أكمل تسجيل Stripe حتى يمكن إرسال المدفوعات إلى بنكك.",
    stripeConnectNotStarted: "لم يتم إعداد Stripe Connect",
    stripeConnectNotStartedHint:
      "اتصل بـ Stripe لاستلام المدفوعات. ستضيف بنكك في صفحة التسجيل الآمنة لدى Stripe.",
    stripeConnectContinue: "متابعة الإعداد",
    stripeConnectStart: "الاتصال بـ Stripe",
    stripeConnectBankLast4: "بنك ···· {{last4}}",
    stripeConnectFailed: "تعذر فتح Stripe Connect. حاول مرة أخرى.",
    stripeConnectReturnSuccess:
      "تم تحديث Stripe Connect. أكمل أي خطوات متبقية إذا كان الإعداد لا يزال غير مكتمل.",
  },
};

let updated = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const locale = f.replace(".json", "");
  const filePath = path.join(dir, f);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const obj = data?.web?.provider?.settings?.pages?.["payout-accounts"];
  if (!obj || typeof obj !== "object") {
    console.log("skip (no payout-accounts)", locale);
    continue;
  }
  if (typeof obj.stripeConnectReturnSuccess === "string") {
    console.log("skip (already patched)", locale);
    continue;
  }
  Object.assign(obj, locale === "en" ? keys : translations[locale] || keys);
  writeJsonWithRetry(filePath, data);
  updated += 1;
}
console.log("updated", updated, "locales");
