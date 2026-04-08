"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Cookie, FileText, Mail, MessageSquare, ExternalLink } from "lucide-react";
import HeroPlaceholder from "../../../public/images/using-your-dashboard-optimized.jpg";
import Breadcrumb from "../account-settings/components/breadcrumb";
import BackButton from "../account-settings/components/back-button";
import { PLATFORM_CONTACT_HREF } from "@/lib/routes/platform-contact";
import { CookieSettingsFooterLink } from "@/components/cookie-consent/CookieSettingsFooterLink";

export interface CookiePolicyData {
  pageTitle: string;
  introHeading: string;
  introHtml: string;
  sections: { title: string; content: string }[];
  sidebarHeading: string;
  sidebarDescription: string;
  heroImage: string | null;
}

export default function CookiePolicyClient({ data }: { data: CookiePolicyData }) {
  const { pageTitle, introHeading, introHtml, sections, sidebarHeading, sidebarDescription, heroImage } = data;

  return (
    <div className="min-h-screen bg-zinc-50/50">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
        <BackButton href="/" />
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Cookie Policy" }]} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 lg:p-12 mb-8"
        >
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
            className="mb-8"
          >
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tighter text-gray-900 mb-4">
              {pageTitle}
            </h1>
            <div className="relative w-full h-64 md:h-80 lg:h-96 rounded-2xl overflow-hidden mb-8">
              {heroImage ? (
                <Image src={heroImage} alt={`${pageTitle} — hero`} fill className="object-cover" priority />
              ) : (
                <Image src={HeroPlaceholder} alt="Beautonomi" fill className="object-cover" priority />
              )}
            </div>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                    <Cookie className="w-6 h-6 text-[#FF0077]" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">{introHeading}</h2>
                </div>
                {introHtml ? (
                  <div
                    className="text-base md:text-lg font-light text-gray-600 mb-6 leading-relaxed prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: introHtml }}
                  />
                ) : (
                  <p className="text-base md:text-lg font-light text-gray-600 mb-6 leading-relaxed">
                    Our Cookie Policy explains how we use cookies and similar technologies on the Platform.
                  </p>
                )}
                <Link
                  href="/privacy-policy"
                  className="inline-flex items-center gap-2 text-[#FF0077] hover:text-[#D60565] font-medium transition-colors group"
                >
                  <FileText className="w-5 h-5" />
                  <span className="underline">Privacy Policy</span>
                  <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8 space-y-8"
              >
                <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-900">Details</h2>
                {sections.map((row, index) => (
                  <div
                    key={`${row.title}-${index}`}
                    className="border-b border-gray-200 pb-8 last:border-b-0 last:pb-0"
                  >
                    <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-3">
                      {index + 1}. {row.title}
                    </h3>
                    <div
                      className="text-sm md:text-base font-light text-gray-600 leading-relaxed prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: row.content }}
                    />
                  </div>
                ))}
              </motion.div>
            </div>

            <div className="md:col-span-1">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8 sticky top-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                    <Mail className="w-5 h-5 text-[#FF0077]" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-gray-900">{sidebarHeading}</h3>
                </div>
                <p className="text-sm md:text-base font-light text-gray-600 mb-6">{sidebarDescription}</p>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Link href={PLATFORM_CONTACT_HREF}>
                    <Button className="w-full bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white mb-4">
                      Contact us
                    </Button>
                  </Link>
                </motion.div>
                <div className="pt-4 border-t border-gray-200 space-y-3">
                  <p className="text-sm font-light text-gray-600">
                    Want to change what we remember in your browser? Open{" "}
                    <CookieSettingsFooterLink variant="policy" className="inline p-0 align-baseline" />.
                  </p>
                  <p className="text-sm font-light text-gray-600 mb-2">
                    You can also{" "}
                    <Link
                      href="/help-center?topic=feedback"
                      className="text-[#FF0077] hover:text-[#D60565] font-medium underline transition-colors inline-flex items-center gap-1"
                    >
                      <MessageSquare className="w-4 h-4" />
                      give us feedback
                    </Link>
                    .
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
