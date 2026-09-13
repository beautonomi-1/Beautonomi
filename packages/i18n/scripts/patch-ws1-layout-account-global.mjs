#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function rw(rel, fn) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, "utf8");
  s = fn(s);
  fs.writeFileSync(p, s);
  console.log(`patched ${rel}`);
}

// footer
rw("apps/web/src/components/layout/footer.tsx", (s) => {
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { MarketCountryFooterPicker } from "@/components/layout/market-country-footer-picker";',
      'import { MarketCountryFooterPicker } from "@/components/layout/market-country-footer-picker";\nimport { useTranslation } from "@beautonomi/i18n";'
    );
    s = s.replace("export default function Footer({", "export default function Footer({");
    s = s.replace("  const pathname = usePathname();", "  const { t } = useTranslation();\n  const pathname = usePathname();");
  }
  s = s.replace('<h4 className="font-semibold text-sm text-gray-900 mb-3">For Business</h4>', '<h4 className="font-semibold text-sm text-gray-900 mb-3">{t("web.layout.footer.forBusiness")}</h4>');
  s = s.replace('<h4 className="font-semibold text-sm text-gray-900 mb-3">Legal</h4>', '<h4 className="font-semibold text-sm text-gray-900 mb-3">{t("web.layout.footer.legal")}</h4>');
  s = s.replace('"Find us on social:"', 't("web.layout.footer.findUsOnSocial")');
  s = s.replace('"© 2024 Beautonomi. All rights reserved."', 't("web.layout.footer.copyright")');
  s = s.replace(">Sitemap</Link>", ">{t(\"web.layout.footer.sitemap\")}</Link>");
  s = s.replace(">Learning Center</Link>", ">{t(\"web.layout.footer.learningCenter\")}</Link>");
  s = s.replace('title: "Android"', 'title: t("web.layout.footer.android")');
  return s;
});

// navbar
rw("apps/web/src/components/layout/navbar.tsx", (s) => {
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { useAuth } from "@/providers/AuthProvider";',
      'import { useAuth } from "@/providers/AuthProvider";\nimport { useTranslation } from "@beautonomi/i18n";'
    );
    s = s.replace("const Navbar: React.FC = () => {", "const Navbar: React.FC = () => {\n  const { t } = useTranslation();");
  }
  s = s.replace('aria-label="Open menu"', 'aria-label={t("web.a11y.openMenu")}');
  s = s.replace("Become a partner", "{t(\"web.layout.navbar.becomePartner\")}");
  s = s.replace("Log In", "{t(\"web.layout.navbar.logIn\")}");
  s = s.replace("Sign Up", "{t(\"web.layout.navbar.signUp\")}");
  s = s.replace("<SheetTitle>Menu</SheetTitle>", "<SheetTitle>{t(\"web.layout.navbar.menu\")}</SheetTitle>");
  s = s.replace("<ShoppingBag className=\"h-4 w-4\" /> Shop Products", "<ShoppingBag className=\"h-4 w-4\" /> {t(\"web.layout.navbar.shopProducts\")}");
  s = s.replace("<ShoppingCart className=\"h-4 w-4\" /> My Cart", "<ShoppingCart className=\"h-4 w-4\" /> {t(\"web.layout.navbar.myCart\")}");
  s = s.replace(">Resources</Link>", ">{t(\"web.layout.navbar.resources\")}</Link>");
  s = s.replace("Bookings", "{t(\"web.layout.navbar.bookings\")}");
  s = s.replace('alt="Global Settings"', 'alt={t("web.layout.navbar.globalSettings")}');
  s = s.replace("<h2 className=\"\">Become a Partner</h2>", "<h2 className=\"\">{t(\"web.layout.navbar.becomePartnerTitle\")}</h2>");
  s = s.replace("Cart{cartCount", "{t(\"web.layout.navbar.cart\")}{cartCount");
  s = s.replace("Search", "{t(\"web.layout.navbar.search\")}");
  // fix double replacements in imports/icons - revert lucide Search if broken
  s = s.replace('import { Menu, {t("web.layout.navbar.search")}', 'import { Menu, Search');
  s = s.replace('<{t("web.layout.navbar.search")} className', '<Search className');
  return s;
});

// landing-navbar
rw("apps/web/src/components/layout/landing-navbar.tsx", (s) => {
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { useAuth } from "@/providers/AuthProvider";',
      'import { useAuth } from "@/providers/AuthProvider";\nimport { useTranslation } from "@beautonomi/i18n";'
    );
    s = s.replace("const LandingNavbar = () => {", "const LandingNavbar = () => {\n  const { t } = useTranslation();");
  }
  s = s.replace('placeholder="Search for providers..."', 'placeholder={t("web.layout.searchProvidersPlaceholder")}');
  s = s.replace("Become service provider", "{t(\"web.layout.landingNavbar.becomeServiceProvider\")}");
  s = s.replace("Become a partner", "{t(\"web.layout.landingNavbar.becomePartner\")}");
  s = s.replace("Account &amp; profile", "{t(\"web.layout.landingNavbar.accountProfile\")}");
  s = s.replace("Sign Out", "{t(\"web.layout.landingNavbar.signOut\")}");
  s = s.replace("Sign In", "{t(\"web.layout.landingNavbar.signIn\")}");
  s = s.replace("Help Center", "{t(\"web.layout.landingNavbar.helpCenter\")}");
  s = s.replace("<SheetTitle>Menu</SheetTitle>", "<SheetTitle>{t(\"web.layout.landingNavbar.menu\")}</SheetTitle>");
  s = s.replace("Log In", "{t(\"auth.login\")}");
  s = s.replace("Sign Up", "{t(\"auth.signup\")}");
  return s;
});

// guest-modal
rw("apps/web/src/components/global/guest-modal.tsx", (s) => {
  if (!s.includes("useTranslation")) {
    s = s.replace('"use client";', '"use client";\nimport { useTranslation } from "@beautonomi/i18n";');
    s = s.replace("const GuestModal = () => {", "const GuestModal = () => {\n  const { t } = useTranslation();");
  }
  s = s.replace(">Adults<", ">{t(\"web.global.guestModal.adults\")}<");
  s = s.replace("Ages 13 or above", "{t(\"web.global.guestModal.adultsAges\")}");
  s = s.replace(">Children<", ">{t(\"web.global.guestModal.children\")}<");
  s = s.replace(">2 - 12<", ">{t(\"web.global.guestModal.childrenAges\")}<");
  s = s.replace(">Infants<", ">{t(\"web.global.guestModal.infants\")}<");
  s = s.replace(">Under 2<", ">{t(\"web.global.guestModal.underTwo\")}<");
  s = s.replace(">Pets<", ">{t(\"web.global.guestModal.pets\")}<");
  s = s.replace("Bringing a service animal?", "{t(\"web.global.guestModal.serviceAnimal\")}");
  s = s.replace(">Clear<", ">{t(\"web.global.guestModal.clear\")}<");
  s = s.replace(">Save<", ">{t(\"web.global.guestModal.save\")}<");
  return s;
});

console.log("layout/global patches done");
