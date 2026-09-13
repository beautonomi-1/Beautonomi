#!/usr/bin/env node
/**
 * Applies Wave A human translations for common, auth, authGate, and web.seo metadata keys.
 * Run: node packages/i18n/scripts/apply-wave-a-translations.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");

const SEO_FR = {
  defaultTitle: "Beautonomi | Réservez coiffure, salons et pros mobiles",
  defaultDescription:
    "Réservez des services beauté de confiance près de chez vous. Salons, spas, barbiers, ongles, maquillage et pros mobiles vérifiés sur Beautonomi.",
  homeTitle: "Marketplace de services beauté",
  homeDescription: "Découvrez et réservez des services beauté auprès de professionnels vérifiés près de chez vous.",
  locationsTitle: "Services beauté par lieu | Beautonomi",
  locationsDescription:
    "Parcourez les freelances et salons beauté vérifiés par pays. Coiffure, ongles, spa et plus sur Beautonomi.",
  categoryTitle: "{{name}} | Réserver sur Beautonomi",
  categoryDescription:
    "Trouvez des services {{name}} auprès de salons et professionnels vérifiés près de chez vous. Réservez sur Beautonomi.",
  providerProfileTitle: "Profil du professionnel | Beautonomi",
  providerProfileDescription: "Découvrez des services beauté auprès de professionnels vérifiés sur Beautonomi",
  providerProfileNamedTitle: "{{name}} | Beautonomi",
  providerProfileNamedDescription: "Réservez {{name}} sur Beautonomi — professionnel beauté vérifié.",
};

const WAVE_A = {
  fr: {
    common: {
      loading: "Chargement…",
      error: "Une erreur s'est produite",
      retry: "Réessayer",
      save: "Enregistrer",
      cancel: "Annuler",
      delete: "Supprimer",
      edit: "Modifier",
      search: "Rechercher",
      back: "Retour",
      next: "Suivant",
      done: "Terminé",
      continue: "Continuer",
      close: "Fermer",
      confirm: "Confirmer",
      appLanguage: "Langue de l'application",
      appLanguageSubtitle: "Choisissez la langue de l'application",
    },
    authGate: {
      checkingAccess: "Vérification de votre compte…",
      checkingSetup: "Vérification de votre configuration…",
    },
    auth: {
      login: "Se connecter",
      signup: "S'inscrire",
      logout: "Se déconnecter",
      email: "E-mail",
      password: "Mot de passe",
      forgotPassword: "Mot de passe oublié ?",
      createAccount: "Créer un compte",
    },
    web: { seo: SEO_FR },
  },
  ar: {
    common: {
      loading: "جاري التحميل…",
      error: "حدث خطأ ما",
      retry: "حاول مرة أخرى",
      save: "حفظ",
      cancel: "إلغاء",
      delete: "حذف",
      edit: "تعديل",
      search: "بحث",
      back: "رجوع",
      next: "التالي",
      done: "تم",
      continue: "متابعة",
      close: "إغلاق",
      confirm: "تأكيد",
      appLanguage: "لغة التطبيق",
      appLanguageSubtitle: "اختر لغة التطبيق",
    },
    authGate: {
      checkingAccess: "جاري التحقق من حسابك…",
      checkingSetup: "جاري التحقق من الإعداد…",
    },
    auth: {
      login: "تسجيل الدخول",
      signup: "إنشاء حساب",
      logout: "تسجيل الخروج",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      forgotPassword: "نسيت كلمة المرور؟",
      createAccount: "إنشاء حساب",
    },
    web: {
      seo: {
        defaultTitle: "Beautonomi | احجز خدمات التجميل والصالونات والمحترفين المتنقلين",
        defaultDescription:
          "احجز خدمات تجميل موثوقة بالقرب منك. صالونات، سبا، حلاقين، أظافر، مكياج ومحترفون متنقلون موثقون على Beautonomi.",
        homeTitle: "سوق خدمات التجميل",
        homeDescription: "اكتشف واحجز خدمات التجميل من مزودين موثقين بالقرب منك.",
        locationsTitle: "خدمات التجميل حسب الموقع | Beautonomi",
        categoryTitle: "{{name}} | احجز على Beautonomi",
        categoryDescription: "اعثر على خدمات {{name}} من صالونات ومحترفين موثقين بالقرب منك.",
        providerProfileTitle: "ملف المزود | Beautonomi",
        providerProfileNamedTitle: "{{name}} | Beautonomi",
        providerProfileNamedDescription: "احجز {{name}} على Beautonomi — محترف تجميل موثق.",
      },
    },
  },
  sw: {
    common: {
      loading: "Inapakia…",
      error: "Kuna tatizo limetokea",
      retry: "Jaribu tena",
      save: "Hifadhi",
      cancel: "Ghairi",
      delete: "Futa",
      edit: "Hariri",
      search: "Tafuta",
      back: "Rudi",
      next: "Ifuatayo",
      done: "Imekamilika",
      continue: "Endelea",
      close: "Funga",
      confirm: "Thibitisha",
      appLanguage: "Lugha ya programu",
      appLanguageSubtitle: "Chagua lugha ya programu",
    },
    authGate: {
      checkingAccess: "Inathibitisha akaunti yako…",
      checkingSetup: "Inathibitisha usanidi…",
    },
    auth: {
      login: "Ingia",
      signup: "Jisajili",
      logout: "Toka",
      email: "Barua pepe",
      password: "Nenosiri",
      forgotPassword: "Umesahau nenosiri?",
      createAccount: "Unda akaunti",
    },
    web: {
      seo: {
        defaultTitle: "Beautonomi | Weka huduma za urembo, saluni na wataalamu wa simu",
        homeTitle: "Soko la huduma za urembo",
        categoryTitle: "{{name}} | Weka nafasi kwenye Beautonomi",
        providerProfileNamedTitle: "{{name}} | Beautonomi",
      },
    },
  },
  es: {
    common: {
      loading: "Cargando…",
      error: "Algo salió mal",
      retry: "Reintentar",
      save: "Guardar",
      cancel: "Cancelar",
      appLanguage: "Idioma de la app",
      appLanguageSubtitle: "Elige el idioma de la aplicación",
    },
    auth: {
      login: "Iniciar sesión",
      signup: "Registrarse",
      email: "Correo electrónico",
      password: "Contraseña",
    },
    web: {
      seo: {
        defaultTitle: "Beautonomi | Reserva belleza, salones y profesionales móviles",
        homeTitle: "Marketplace de servicios de belleza",
        categoryTitle: "{{name}} | Reservar en Beautonomi",
        providerProfileNamedTitle: "{{name}} | Beautonomi",
      },
    },
  },
  pt: {
    common: {
      loading: "A carregar…",
      error: "Ocorreu um erro",
      save: "Guardar",
      cancel: "Cancelar",
      appLanguage: "Idioma da app",
    },
    auth: {
      login: "Entrar",
      signup: "Registar",
      email: "E-mail",
      password: "Palavra-passe",
    },
    web: {
      seo: {
        defaultTitle: "Beautonomi | Marque serviços de beleza, salões e profissionais móveis",
        homeTitle: "Marketplace de serviços de beleza",
        categoryTitle: "{{name}} | Marcar na Beautonomi",
        providerProfileNamedTitle: "{{name}} | Beautonomi",
      },
    },
  },
};

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object") {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

for (const [code, patch] of Object.entries(WAVE_A)) {
  const file = path.join(localesDir, `${code}.json`);
  if (!fs.existsSync(file)) continue;
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const merged = deepMerge(json, patch);
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
  console.log(`Updated ${code}.json (Wave A partial)`);
}
