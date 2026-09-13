"use client";

import { useTranslation } from "@beautonomi/i18n";
import { MoveUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "../ui/button";
import GooglePlayStore from './../../../public/images/playstore-svgrepo-com.svg'
import Apple from './../../../public/images/apple-173-svgrepo-com.svg'
import PlatformLogo from "../platform/PlatformLogo";

export default function Footer1() {
  const { t } = useTranslation();
  return (
    <footer className="bg-primary py-8">
      <div className="max-w-[2340px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          <div>
            <Link href="/">
            <PlatformLogo alt={t("web.layout.footer1.logoAlt")} className="mb-4 w-44" />
            </Link>
            <div className="space-y-2">
              <Button className="bg-white text-black text-xs justify-start" size="lg">
                <Image
                  src={GooglePlayStore}
                  alt={t("web.layout.footer1.googlePlayAlt")}
                  className="h-6 w-6 me-2"
                />
                {t("web.layout.footer1.downloadGooglePlay")}
              </Button>
              <Button className="bg-white text-black text-xs  justify-start px-9" size="lg">
                <Image
                  src={Apple}
                  alt={t("web.layout.footer1.appStoreAlt")}
                  className="h-6 w-6 me-2"
                />
                  {t("web.layout.footer1.downloadAppStore")}
              </Button>
            </div>
          </div>
          
          {[
            {
              id: "about",
              title: t("web.layout.footer1.aboutTitle"),
              links: [
                { href: "/career", text: t("web.layout.footer1.careers") },
                { href: "/", text: t("web.layout.footer1.customerSupport") },
              ],
            },
            {
              id: "business",
              title: t("web.layout.footer1.forBusiness"),
              links: [
                { href: "/BCover-for-partners", text: t("web.layout.footer1.forPartners") },
                { href: "/", text: t("web.layout.footer1.pricing") },
                { href: "/", text: t("web.layout.footer1.support") },
              ],
            },
            {
              id: "legal",
              title: t("web.layout.footer.legal"),
              links: [
                { href: "/privacy-policy", text: t("web.auth.inlineSignup.privacyPolicy") },
                { href: "/terms-and-condition", text: t("web.auth.inlineSignup.termsOfService") },
                { href: "/", text: t("web.layout.footer1.termsOfUse") },
              ],
            },
            {
              id: "social",
              title: t("web.layout.footer1.findUsOnSocial"),
              links: [
                { href: "https://facebook.com", text: t("web.global.shareAppModal.facebook") },
                { href: "https://x.com", text: t("web.global.shareAppModal.x") },
                { href: "https://linkedin.com", text: t("web.layout.footer1.linkedin") },
                { href: "https://instagram.com", text: t("web.layout.footer1.instagram") },
              ],
            },
          ].map((section) => (
            <div key={section.id}>
              <h3 className="font-semibold mb-4 text-sm">{section.title}</h3>
              <ul className="space-y-2">
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <Link
                      href={link.href}
                      className="text-gray-600 hover:text-gray-900 text-sm flex items-center font-light"
                    >
                      {section.id === "social" && <MoveUpRight size={14} className="me-1" />}
                      {link.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        
        <div className="mt-8 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-gray-500 text-xs font-light">
            <p className="m-0">{t("web.layout.footer.copyright")}</p>
            <span className="text-gray-400">·</span>
            <Link href="/sitemap.xml" className="hover:text-gray-700 hover:underline">{t("web.layout.footer.sitemap")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}