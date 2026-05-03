'use client'
import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import GooglePlayIcon from "../../../public/images/playstore-svgrepo-com.svg";
import LanguageModal from "../global/langauges-modal";
import { Facebook, Linkedin, Instagram, ArrowRight } from "lucide-react";
import { FaXTwitter } from "react-icons/fa6";
import { fetcher } from "@/lib/http/fetcher";
import type { PublicFooterInitial } from "@/types/public-footer-initial";
import { CookieSettingsFooterLink } from "@/components/cookie-consent/CookieSettingsFooterLink";
import { MarketCountryFooterPicker } from "@/components/layout/market-country-footer-picker";

interface FooterLink {
  id: string;
  section: "about" | "business" | "legal" | "social" | "apps";
  title: string;
  href: string;
  display_order: number;
  is_external: boolean;
  is_active: boolean;
}

interface AppLink {
  id: string;
  platform: "ios" | "android";
  title: string;
  href: string;
  is_active: boolean;
}

interface FooterSettings {
  social_label?: string;
  copyright_text?: string;
}

export default function Footer({
  initialFooter,
}: {
  /** When provided (e.g. home RSC), links/settings render immediately without client fetch */
  initialFooter?: PublicFooterInitial;
}) {
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);
  const [footerLinks, setFooterLinks] = useState<FooterLink[]>(
    () => initialFooter?.links ?? [],
  );
  const [appLinks, setAppLinks] = useState<AppLink[]>(
    () => initialFooter?.appLinks ?? [],
  );
  /** App links from Settings → Apps (platform_settings): provider on /become-a-partner, customer elsewhere */
  const [contextAppLinks, setContextAppLinks] = useState<AppLink[] | null>(null);
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(
    () => initialFooter?.settings ?? {},
  );
  const [isLoading, setIsLoading] = useState(() => initialFooter === undefined);

  const isProviderPage = Boolean(pathname?.includes("/become-a-partner"));
  const appContext = isProviderPage ? "provider" : "customer";

  const _handleOpenModal = () => {
    setModalOpen(true);
  };

  useEffect(() => {
    if (initialFooter !== undefined) return;

    const loadFooterData = async () => {
      try {
        // Footer data is static; 10-minute in-memory cache prevents re-fetching on
        // every page visit within a browsing session.
        const [linksResponse, settingsResponse] = await Promise.all([
          fetcher.get<{ data: { links: FooterLink[]; appLinks: AppLink[] }; error: null }>("/api/public/footer-links", { staleTimeMs: 10 * 60_000 }),
          fetcher.get<{ data: FooterSettings; error: null }>("/api/public/footer-settings", { staleTimeMs: 10 * 60_000 }),
        ]);
        
        if (linksResponse.data) {
          setFooterLinks(linksResponse.data.links || []);
          setAppLinks(linksResponse.data.appLinks || []);
        }
        
        if (settingsResponse.data) {
          setFooterSettings(settingsResponse.data || {});
        }
      } catch (error) {
        console.error("Failed to load footer data:", error);
        // Fallback to default values if API fails
      } finally {
        setIsLoading(false);
      }
    };
    loadFooterData();
  }, [initialFooter]);

  // Footer app buttons use Settings → Apps: provider on /become-a-partner, customer elsewhere (single source of truth)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{
          data: {
            android?: { download_url?: string; enabled?: boolean };
            ios?: { app_store_url?: string; enabled?: boolean };
          };
          error: null;
        }>(`/api/public/apps?type=${appContext}`, { staleTimeMs: 10 * 60_000 });
        if (cancelled || !res?.data) return;
        const links: AppLink[] = [];
        if (res.data.android?.enabled !== false && res.data.android?.download_url) {
          links.push({
            id: `${appContext}-android`,
            platform: "android",
            title: "Android",
            href: res.data.android.download_url,
            is_active: true,
          });
        }
        if (res.data.ios?.enabled !== false && res.data.ios?.app_store_url) {
          links.push({
            id: `${appContext}-ios`,
            platform: "ios",
            title: "iOS",
            href: res.data.ios.app_store_url,
            is_active: true,
          });
        }
        if (!cancelled) setContextAppLinks(links);
      } catch {
        if (!cancelled) setContextAppLinks(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appContext]);

  // Group links by section (exclude Sitemap from about – shown only in bottom bar)
  const linksBySection = footerLinks.reduce((acc, link) => {
    if (link.section === "about" && link.href === "/sitemap") return acc;
    if (!acc[link.section]) {
      acc[link.section] = [];
    }
    acc[link.section].push(link);
    return acc;
  }, {} as Record<string, FooterLink[]>);

  // Get social media links
  const socialLinks = linksBySection.social || [];
  const businessLinks = (linksBySection.business || []).filter((link) => {
    const title = (link.title || "").trim().toLowerCase();
    const href = (link.href || "").trim().toLowerCase();
    // Avoid duplicate footer entry: keep Gift Card Purchase under About only.
    if (title === "gift card purchase") return false;
    if (href.includes("gift-card-purchase")) return false;
    return true;
  });
  const legalLinks = (() => {
    const raw = linksBySection.legal || [];
    const seen = new Set<string>();
    const out: FooterLink[] = [];
    for (const link of raw) {
      const title = (link.title || "").trim().toLowerCase();
      const href = (link.href || "").trim().toLowerCase();
      // Treat "Terms of Service" and "Terms of Use" as same destination in footer.
      const isTermsAlias =
        title === "terms of service" ||
        title === "terms of use" ||
        href.includes("/terms-and-condition") ||
        href.includes("/terms");
      const key = isTermsAlias ? "terms" : `${href}::${title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(link);
    }
    return out;
  })();

  // Helper to render a link
  const renderLink = (link: FooterLink) => {
    if (link.is_external) {
      return (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {link.title}
        </a>
      );
    }
    return (
      <Link href={link.href} className="hover:underline">
        {link.title}
      </Link>
    );
  };

  // Prefer Settings → Apps (contextAppLinks); fallback to Content → App links (footer_app_links)
  const effectiveAppLinks =
    contextAppLinks && contextAppLinks.length > 0 ? contextAppLinks : appLinks;
  const androidApp = effectiveAppLinks.find((app) => app.platform === "android");
  const iosApp = effectiveAppLinks.find((app) => app.platform === "ios");

  return (
    <footer className="bg-white border-t pt-8 md:pt-12 pb-20 md:pb-6">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20">
        <div className="flex flex-col md:flex-row justify-between mb-6 md:mb-8 gap-6">
          {/* Left Side - Logo and App Downloads */}
          <div className="space-y-4">
            <Link href="/">
              <h1 className="text-xl md:text-2xl font-bold text-primary mb-4">
                BEAUTONOMI
              </h1>
            </Link>
            <div className="space-y-3">
              {androidApp && (
                <a
                  href={androidApp.href}
                  className="flex items-center gap-2 border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors w-fit"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Image
                    src={GooglePlayIcon}
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5 shrink-0"
                    aria-hidden
                  />
                  <span className="text-sm font-normal">{androidApp.title}</span>
                </a>
              )}
              {iosApp && (
                <a
                  href={iosApp.href}
                  className="flex items-center gap-2 border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors w-fit"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  <span className="text-sm font-normal">{iosApp.title}</span>
                </a>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 text-sm">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-32 mb-3"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 text-sm">
              <div>
                <h4 className="font-semibold text-sm text-gray-900 mb-3">About Beautonomi</h4>
                <ul className="space-y-2 text-sm font-light text-gray-600">
                  <li className="hover:underline">
                    <Link href="/learn">Learning Center</Link>
                  </li>
                  {(linksBySection.about ?? []).map((link) => (
                    <li key={link.id} className="hover:underline">
                      {renderLink(link)}
                    </li>
                  ))}
                </ul>
              </div>
              {businessLinks.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-900 mb-3">For Business</h4>
                  <ul className="space-y-2 text-sm font-light text-gray-600">
                    {businessLinks.map((link) => (
                      <li key={link.id} className="hover:underline">
                        {renderLink(link)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {legalLinks.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-900 mb-3">Legal</h4>
                  <ul className="space-y-2 text-sm font-light text-gray-600">
                    {legalLinks.map((link) => (
                      <li key={link.id} className="hover:underline">
                        {renderLink(link)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Social Media and Copyright */}
        <div className="pt-6 border-t">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {footerSettings.social_label || "Find us on social:"}
              </span>
              <div className="flex items-center gap-3">
                {socialLinks.length > 0 ? (
                  socialLinks.map((link) => {
                    const iconMap: Record<string, React.ReactNode> = {
                      facebook: <Facebook className="w-4 h-4" />,
                      twitter: <FaXTwitter className="w-4 h-4" aria-hidden />,
                      x: <FaXTwitter className="w-4 h-4" aria-hidden />,
                      linkedin: <Linkedin className="w-4 h-4" />,
                      instagram: <Instagram className="w-4 h-4" />,
                    };
                    const iconKey = link.title.toLowerCase();
                    const icon = iconMap[iconKey] || <ArrowRight className="w-3 h-3" />;
                    
                    return (
                      <a
                        key={link.id}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-gray-600 hover:text-primary transition-colors"
                        title={link.title}
                      >
                        {icon}
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    );
                  })
                ) : (
                  // Fallback to default social links if CMS fails
                  <>
                    <a
                      href="https://facebook.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-gray-600 hover:text-primary transition-colors"
                    >
                      <Facebook className="w-4 h-4" />
                      <ArrowRight className="w-3 h-3" />
                    </a>
                    <a
                      href="https://x.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-gray-600 hover:text-primary transition-colors"
                      title="X"
                    >
                      <FaXTwitter className="w-4 h-4" aria-hidden />
                      <ArrowRight className="w-3 h-3" />
                    </a>
                    <a
                      href="https://linkedin.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-gray-600 hover:text-primary transition-colors"
                    >
                      <Linkedin className="w-4 h-4" />
                      <ArrowRight className="w-3 h-3" />
                    </a>
                    <a
                      href="https://instagram.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-gray-600 hover:text-primary transition-colors"
                    >
                      <Instagram className="w-4 h-4" />
                      <ArrowRight className="w-3 h-3" />
                    </a>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-col items-center gap-3 md:items-end">
              <Suspense fallback={null}>
                <MarketCountryFooterPicker />
              </Suspense>
              <div className="flex flex-wrap justify-center md:justify-end items-center gap-x-3 gap-y-1 text-sm text-gray-600">
              <span className="text-center md:text-right">
                {footerSettings.copyright_text || "© 2024 Beautonomi. All rights reserved."}
              </span>
              <span className="text-gray-400 hidden sm:inline">·</span>
              <Link href="/sitemap.xml" className="hover:underline text-center md:text-right">Sitemap</Link>
              <span className="text-gray-400 hidden sm:inline">·</span>
              <CookieSettingsFooterLink variant="footer" className="text-center md:text-right" showChevron />
              <span className="text-gray-400 hidden sm:inline">·</span>
              <Link href="/learn" className="hover:underline text-center md:text-right">Learning Center</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      <LanguageModal open={modalOpen} onOpenChange={setModalOpen} />
    </footer>
  );
}
