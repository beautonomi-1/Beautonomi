#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// search-bar
{
  const p = path.join(root, "apps/web/src/components/global/search-bar.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { toast } from "sonner";',
      'import { toast } from "sonner";\nimport { useTranslation } from "@beautonomi/i18n";'
    );
    s = s.replace(
      "const SearchBar: React.FC<SearchBarProps> = ({",
      "const SearchBar: React.FC<SearchBarProps> = ({"
    );
    s = s.replace(
      "const SearchBar: React.FC<SearchBarProps> = ({\n  searchQuery,\n  onSearchSubmit,\n}) => {",
      "const SearchBar: React.FC<SearchBarProps> = ({\n  searchQuery,\n  onSearchSubmit,\n}) => {\n  const { t } = useTranslation();"
    );
  }
  s = s.replace('placeholder="Search categories"', 'placeholder={t("web.layout.searchCategoriesPlaceholder")}');
  s = s.replace('placeholder="Search for an address..."', 'placeholder={t("web.layout.searchAddressPlaceholder")}');
  fs.writeFileSync(p, s);
  console.log("search-bar patched");
}

// login-modal - high traffic shell strings
{
  const p = path.join(root, "apps/web/src/components/global/login-modal.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes('const { t } = useTranslation()')) {
    s = s.replace(
      'import { PENDING_MARKETING_CONSENT_KEY } from "@/lib/auth/persist-marketing-consent";',
      'import { PENDING_MARKETING_CONSENT_KEY } from "@/lib/auth/persist-marketing-consent";\nimport { useTranslation } from "@beautonomi/i18n";'
    );
    s = s.replace(
      "}: LoginModalProps) {\n  const router = useRouter();",
      "}: LoginModalProps) {\n  const { t } = useTranslation();\n  const router = useRouter();"
    );
  }
  s = s.replace(
    'const LOGIN_MODAL_I18N_LABELS: Record<string, string> = {',
    'const LOGIN_MODAL_I18N_LABELS_FALLBACK: Record<string, string> = {'
  );
  // helper usage - find tLabel function if exists
  if (!s.includes("function loginModalLabel")) {
    s = s.replace(
      'const LOGIN_MODAL_I18N_LABELS_FALLBACK: Record<string, string> = {',
      `const loginModalLabel = (key: string, tFn: (k: string) => string) => {
    const mapped: Record<string, string> = {
      "auth.preferredLanguage": "auth.preferredLanguage",
      "auth.howHearAboutUs": "auth.howHearAboutUs",
      "auth.signupSourceSkip": "auth.signupSourceSkip",
      "auth.signupSource.social_media": "auth.signupSourceOther",
      "auth.signupSource.friend_family": "auth.signupSourceFriend",
      "auth.signupSource.google_search": "auth.signupSourceOther",
      "auth.signupSource.advertisement": "auth.signupSourceOther",
      "auth.signupSource.other": "auth.signupSourceOther",
    };
    const i18nKey = mapped[key] ?? key;
    try { return tFn(i18nKey); } catch { return LOGIN_MODAL_I18N_LABELS_FALLBACK[key] ?? key; }
  };
  const LOGIN_MODAL_I18N_LABELS_FALLBACK: Record<string, string> = {`
    );
  }
  s = s.replace("Log in or sign up", "{t(\"web.global.loginModal.welcomeBack\")}");
  s = s.replace("Welcome to Beautonomi", "{t(\"web.global.loginModal.joinBeautonomi\")}");
  s = s.replace("Continue with Google", "{t(\"auth.continueWithGoogle\")}");
  s = s.replace("Continue with Apple", "{t(\"auth.continueWithApple\")}");
  s = s.replace("Continue with Phone", "{t(\"web.global.loginModal.continueWithPhone\")}");
  s = s.replace("Continue with email", "{t(\"web.global.loginModal.continueWithEmail\")}");
  s = s.replace('>Email</Label>', '>{t("auth.email")}</Label>');
  s = s.replace('>Password</Label>', '>{t("auth.password")}</Label>');
  s = s.replace('"Log in"', 't("auth.login")');
  s = s.replace('"Sign up"', 't("auth.signup")');
  s = s.replace("Already have an account? Log in", '{t("auth.alreadyHaveAccount")} {t("auth.login")}');
  s = s.replace("Don't have an account? Sign up", '{t("auth.dontHaveAccount")} {t("auth.signup")}');
  fs.writeFileSync(p, s);
  console.log("login-modal patched");
}

// mobile-search-bar placeholders
{
  const p = path.join(root, "apps/web/src/components/layout/mobile-search-bar.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { toast } from "sonner";',
      'import { toast } from "sonner";\nimport { useTranslation } from "@beautonomi/i18n";'
    );
    s = s.replace(
      "const MobileSearchBar = () => {",
      "const MobileSearchBar = () => {\n  const { t } = useTranslation();"
    );
  }
  s = s.replace('placeholder="Search categories"', 'placeholder={t("web.layout.searchCategoriesPlaceholder")}');
  s = s.replace('placeholder="Search for an address..."', 'placeholder={t("web.layout.searchAddressPlaceholder")}');
  fs.writeFileSync(p, s);
  console.log("mobile-search-bar patched");
}
