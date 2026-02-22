"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Shield, FileText, Mail, MessageSquare, ExternalLink } from "lucide-react";
import Image1 from "./../../../public/images/using-your-dashboard-optimized.jpg";
import Breadcrumb from "../account-settings/components/breadcrumb";
import BackButton from "../account-settings/components/back-button";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface PageContent {
  id: string;
  page_slug: string;
  section_key: string;
  content_type: "text" | "html" | "json" | "image" | "video";
  content: string;
  metadata?: Record<string, any>;
  order: number;
}

const defaultArticles = [
  {
    category: "Beautonomi basics",
    title: "Verifying your identity on Beautonomi",
    description:
      "At Beautonomi, trust is the cornerstone of our community – where millions of people across the world place trust in each other as they travel or...",
    link: "#",
  },
  {
    category: "Host",
    title: "Create a Danish unique code",
    description:
      "As of October 31, 2023, Danish tax authorities (Skat.dk) have turned off the ability to create a new unique code. Hosts will not be able to ...",
    link: "#",
  },
  {
    category: "",
    title: "About the updates to our Terms",
    description: "Please review this information about updates to our Terms.",
    link: "#",
  },
];

const defaultSupplementalPolicies = [
  { title: "Outside the United States", link: "/outside-us" },
  { title: "State-Specific Supplements", link: "/state-specific" },
  { title: "Cookie Policy", link: "/cookie-policy" },
  {
    title: "Enterprise Customers and Beautonomi for Work",
    link: "/enterprise-customers",
  },
  { title: "Privacy Supplement for China Users", link: "/china-users" },
  { title: "Colombia Only", link: "/colombia-only" },
  { title: "Türkiye Only", link: "/turkey-only" },
];

export default function PrivacyPolicyPage() {
  const [_pageContent, setPageContent] = useState<PageContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [title, setTitle] = useState("Beautonomi Privacy");
  const [description, setDescription] = useState(
    "Our Privacy Policy explains what personal information we collect, how we use personal information, how personal information is shared, and privacy rights."
  );
  const [supplementalPolicies, setSupplementalPolicies] = useState(defaultSupplementalPolicies);
  const [articles, setArticles] = useState(defaultArticles);

  useEffect(() => {
    loadPageContent();
  }, []);

  const loadPageContent = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: PageContent[] }>(
        "/api/public/content/pages/privacy-policy"
      );
      
      const content = response.data || [];
      setPageContent(content);

      // Extract content by section_key
      const getContent = (key: string) => {
        const section = content.find((c) => c.section_key === key);
        return section?.content || "";
      };

      // Set dynamic content
      const heroTitle = getContent("hero_title") || title;
      const heroDesc = getContent("hero_description") || description;
      const heroImg = getContent("hero_image");
      
      setTitle(heroTitle);
      setDescription(heroDesc);
      if (heroImg) setHeroImage(heroImg);

      // Parse supplemental policies from JSON if available
      const supplementalContent = getContent("supplemental_policies");
      if (supplementalContent) {
        try {
          const parsed = JSON.parse(supplementalContent);
          if (Array.isArray(parsed)) {
            setSupplementalPolicies(parsed);
          }
        } catch {
          // Use default if parsing fails
        }
      }

      // Parse articles from JSON if available
      const articlesContent = getContent("related_articles");
      if (articlesContent) {
        try {
          const parsed = JSON.parse(articlesContent);
          if (Array.isArray(parsed)) {
            setArticles(parsed);
          }
        } catch {
          // Use default if parsing fails
        }
      }
    } catch (error) {
      console.error("Error loading page content:", error);
      // Use defaults on error
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <LoadingTimeout loadingMessage="Loading privacy policy..." />
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-zinc-50/50">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
        <BackButton href="/" />
        <Breadcrumb
          items={[
            { label: "Home", href: "/" },
            { label: "Privacy Policy" },
          ]}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 lg:p-12 mb-8"
        >
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
            className="mb-8"
          >
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tighter text-gray-900 mb-4">
              {title}
            </h1>
            <div className="relative w-full h-64 md:h-80 lg:h-96 rounded-2xl overflow-hidden mb-8">
              {heroImage ? (
                <Image
                  src={heroImage}
                  alt="Privacy Policy"
                  fill
                  className="object-cover"
                  priority
                />
              ) : (
                <Image
                  src={Image1}
                  alt="People collaborating"
                  fill
                  className="object-cover"
                  priority
                />
              )}
            </div>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="md:col-span-2 space-y-8">
              {/* Privacy Policy Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-pink-50 rounded-full border border-pink-100">
                    <Shield className="w-6 h-6 text-[#FF0077]" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">
                    Privacy Policy
                  </h2>
                </div>
                <div 
                  className="text-base md:text-lg font-light text-gray-600 mb-6 leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ 
                    __html: description || "Our Privacy Policy explains what personal information we collect, how we use personal information, how personal information is shared, and privacy rights."
                  }}
                />
                <Link
                  href="/privacy-policy"
                  className="inline-flex items-center gap-2 text-[#FF0077] hover:text-[#D60565] font-medium transition-colors group"
                >
                  <FileText className="w-5 h-5" />
                  <span className="underline">Privacy Policy</span>
                  <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </motion.div>

              {/* Supplemental Policies Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8"
              >
                <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-900 mb-4">
                  Supplemental Privacy Policy Documents
                </h3>
                <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                  Please review the supplemental privacy policies linked within the
                  privacy policy documents, such as for certain Beautonomi services,
                  that may be applicable to you.
                </p>
                <ul className="space-y-3">
                  {supplementalPolicies.map((policy, index) => (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + index * 0.05, duration: 0.3 }}
                      whileHover={{ scale: 1.02, x: 4 }}
                      className="backdrop-blur-sm bg-white/60 border border-white/40 rounded-lg p-4 hover:shadow-md transition-all"
                    >
                      <Link
                        href={policy.link}
                        className="flex items-center justify-between group"
                      >
                        <span className="text-[#FF0077] hover:text-[#D60565] font-medium underline transition-colors">
                          {policy.title}
                        </span>
                        <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-[#FF0077] transition-colors" />
                      </Link>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>

              {/* Related Articles Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5, ease: "easeOut" }}
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8"
              >
                <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-900 mb-6">
                  Related articles
                </h2>
                <div className="space-y-6">
                  {articles.map((article, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7 + index * 0.1, duration: 0.3 }}
                      whileHover={{ scale: 1.01 }}
                      className="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0"
                    >
                      {article.category && (
                        <p className="text-sm font-medium text-[#FF0077] mb-2">
                          {article.category}
                        </p>
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
            </div>

            {/* Sidebar */}
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
                  <h3 className="text-xl font-semibold tracking-tight text-gray-900">
                    Need to get in touch?
                  </h3>
                </div>
                <p className="text-sm md:text-base font-light text-gray-600 mb-6">
                  We&apos;ll start with some questions and get you to the right
                  place.
                </p>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Link href="/account-settings/messages">
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
