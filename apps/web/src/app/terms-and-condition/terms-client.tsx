"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { FileText, Scale, Mail, MessageSquare, ExternalLink } from "lucide-react";
import HeroPlaceholder from "../../../public/images/using-your-dashboard-optimized.jpg";
import Breadcrumb from "../account-settings/components/breadcrumb";
import BackButton from "../account-settings/components/back-button";
import { PLATFORM_CONTACT_HREF } from "@/lib/routes/platform-contact";

export interface TermsData {
  pageTitle: string;
  introHeading: string;
  introHtml: string;
  sections: { title: string; content: string }[];
  sidebarHeading: string;
  sidebarDescription: string;
  heroImage: string | null;
  supplementalPolicies: { title: string; link: string }[];
  articles: { category?: string; title: string; description: string; link: string }[];
}

export default function TermsClient({ data }: { data: TermsData }) {
  const {
    pageTitle,
    introHeading,
    introHtml,
    sections,
    sidebarHeading,
    sidebarDescription,
    heroImage,
    supplementalPolicies,
    articles,
  } = data;

  return (
    <div className="min-h-screen bg-zinc-50/50">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
        <BackButton href="/" />
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Terms & Conditions" },
          ]}
        />

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
                <Image src={HeroPlaceholder} alt="Beautonomi community" fill className="object-cover" priority />
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
                    <Scale className="w-6 h-6 text-[#FF0077]" />
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
                    These Terms of Service govern your use of our beauty and salon services. By booking or using our
                    services, you agree to these terms.
                  </p>
                )}
                <Link
                  href="/terms-and-condition"
                  className="inline-flex items-center gap-2 text-[#FF0077] hover:text-[#D60565] font-medium transition-colors group"
                >
                  <FileText className="w-5 h-5" />
                  <span className="underline">Terms &amp; Conditions</span>
                  <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8 space-y-8"
              >
                <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-900">Terms details</h2>
                {sections.map((term, index) => (
                  <div
                    key={`${term.title}-${index}`}
                    className="border-b border-gray-200 pb-8 last:border-b-0 last:pb-0"
                  >
                    <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-3">
                      {index + 1}. {term.title}
                    </h3>
                    <div
                      className="text-sm md:text-base font-light text-gray-600 leading-relaxed prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: term.content }}
                    />
                  </div>
                ))}
              </motion.div>

              {supplementalPolicies.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8"
                >
                  <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-900 mb-4">
                    Related documents
                  </h3>
                  <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                    Additional policies and supplements that may apply to your use of Beautonomi.
                  </p>
                  <ul className="space-y-3">
                    {supplementalPolicies.map((policy, index) => (
                      <motion.li
                        key={`${policy.link}-${index}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.45 + index * 0.05, duration: 0.3 }}
                        whileHover={{ scale: 1.02, x: 4 }}
                        className="backdrop-blur-sm bg-white/60 border border-white/40 rounded-lg p-4 hover:shadow-md transition-all"
                      >
                        <Link href={policy.link} className="flex items-center justify-between group">
                          <span className="text-[#FF0077] hover:text-[#D60565] font-medium underline transition-colors">
                            {policy.title}
                          </span>
                          <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-[#FF0077] transition-colors" />
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              )}

              {articles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8"
                >
                  <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-900 mb-6">
                    Related articles
                  </h2>
                  <div className="space-y-6">
                    {articles.map((article, index) => (
                      <motion.div
                        key={`${article.link}-${index}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.55 + index * 0.1, duration: 0.3 }}
                        whileHover={{ scale: 1.01 }}
                        className="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0"
                      >
                        {article.category && (
                          <p className="text-sm font-medium text-[#FF0077] mb-2">{article.category}</p>
                        )}
                        <Link href={article.link} className="block group">
                          <h3 className="text-lg md:text-xl font-semibold text-gray-900 hover:text-[#FF0077] transition-colors mb-2">
                            {article.title}
                          </h3>
                        </Link>
                        <p className="text-sm md:text-base font-light text-gray-600 leading-relaxed">
                          {article.description}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
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
                <div className="pt-4 border-t border-gray-200">
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
