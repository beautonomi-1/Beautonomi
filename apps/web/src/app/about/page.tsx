import React from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import { createSupabaseAnonPublicClient } from "@/lib/supabase/public-read";
import { PLATFORM_CONTACT_HREF } from "@/lib/routes/platform-contact";
import { Mail, Phone, HelpCircle } from "lucide-react";

export interface AboutSection {
  section_key: string;
  title: string;
  content: string;
  image_url?: string | null;
}

function helpCentreHref(raw: string): string {
  const c = raw.trim();
  if (/^https?:\/\//i.test(c)) return c;
  if (c.startsWith("/")) return c;
  return PLATFORM_CONTACT_HREF;
}

export const revalidate = 300;

async function getAboutSections(): Promise<AboutSection[]> {
  try {
    const supabase = createSupabaseAnonPublicClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("about_us_content")
      .select("section_key, title, content, image_url")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (error) throw error;
    return (data || []) as AboutSection[];
  } catch (error) {
    console.error("Failed to load about page content:", error);
    return [];
  }
}

export default async function AboutPage() {
  const sections = await getAboutSections();

  const hero = sections[0];
  const storySections = sections.filter(
    (s) => ["what_we_do", "for_professionals"].includes(s.section_key)
  );
  const trustSection = sections.find((s) => s.section_key === "safety_trust");
  const contactIntro = sections.find((s) => s.section_key === "contact_intro");
  const contactItems = sections.filter((s) =>
    ["contact_email", "contact_phone", "contact_help_center"].includes(s.section_key)
  );

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full">
      <BeautonomiHeader />
      <div className="w-full max-w-full overflow-x-hidden">
      {/* Hero — first section (e.g. Our Mission) — Revolut-style bold hero */}
      {hero && (
        <section className="relative bg-gradient-to-b from-[#FF0077]/5 to-white pt-16 md:pt-24 pb-20 md:pb-28">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="order-2 lg:order-1">
                <p className="text-sm font-semibold uppercase tracking-wider text-[#FF0077] mb-4">
                  About us
                </p>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight leading-tight mb-6">
                  {hero.title}
                </h1>
                <div
                  className="prose prose-lg max-w-none text-gray-600 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: hero.content }}
                />
              </div>
              {hero.image_url && (
                <div className="order-1 lg:order-2 relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 shadow-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={hero.image_url}
                    alt={hero.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Story blocks — alternating image/text (what_we_do, for_professionals) */}
      {storySections.map((section, index) => (
        <section
          key={section.section_key}
          className={`py-16 md:py-24 ${index % 2 === 1 ? "bg-gray-50/80" : "bg-white"}`}
        >
          <div className="container mx-auto px-4 max-w-6xl">
            <div
              className={`grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center ${
                index % 2 === 1 ? "md:flex-row-reverse" : ""
              }`}
            >
              <div className={index % 2 === 1 ? "md:order-2" : ""}>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
                  {section.title}
                </h2>
                <div
                  className="prose prose-lg max-w-none text-gray-600"
                  dangerouslySetInnerHTML={{ __html: section.content }}
                />
              </div>
              {section.image_url ? (
                <div
                  className={`relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 ${
                    index % 2 === 1 ? "md:order-1" : ""
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={section.image_url}
                    alt={section.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className={`relative aspect-[4/3] rounded-2xl bg-gray-100 flex items-center justify-center ${
                    index % 2 === 1 ? "md:order-1" : ""
                  }`}
                >
                  <div className="text-gray-300 text-6xl font-bold opacity-50">
                    {index + 1}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      ))}

      {/* Trust — safety_trust, distinct block */}
      {trustSection && (
        <section className="py-20 md:py-28 bg-[#222222] text-white">
          <div className="container mx-auto px-4 max-w-3xl text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-6">
              {trustSection.title}
            </h2>
            <div
              className="prose prose-lg prose-invert max-w-none mx-auto text-gray-300"
              dangerouslySetInnerHTML={{ __html: trustSection.content }}
            />
          </div>
        </section>
      )}

      {/* Contact — intro + grid of contact items */}
      {(contactIntro || contactItems.length > 0) && (
        <section className="py-20 md:py-28 bg-white">
          <div className="container mx-auto px-4 max-w-4xl">
            {contactIntro && (
              <div className="text-center mb-12">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                  {contactIntro.title}
                </h2>
                <div
                  className="prose prose-lg max-w-none mx-auto text-gray-600"
                  dangerouslySetInnerHTML={{ __html: contactIntro.content }}
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
              {contactItems.map((item) => {
                const isEmail = item.section_key === "contact_email";
                const isPhone = item.section_key === "contact_phone";
                const isHelp = item.section_key === "contact_help_center";
                const href = isEmail
                  ? `mailto:${item.content.trim()}`
                  : isPhone
                    ? `tel:${item.content.replace(/\s/g, "")}`
                    : isHelp
                      ? helpCentreHref(item.content)
                      : undefined;
                const helpOpensExternal =
                  isHelp &&
                  href &&
                  (href.startsWith("http://") || href.startsWith("https://"));
                const Icon = isEmail ? Mail : isPhone ? Phone : HelpCircle;
                return (
                  <a
                    key={item.section_key}
                    href={href}
                    target={helpOpensExternal ? "_blank" : undefined}
                    rel={helpOpensExternal ? "noopener noreferrer" : undefined}
                    className="flex flex-col items-center text-center p-6 rounded-2xl border border-gray-200 hover:border-[#FF0077]/40 hover:bg-[#FF0077]/5 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#FF0077]/10 flex items-center justify-center mb-4 group-hover:bg-[#FF0077]/20 transition-colors">
                      <Icon className="w-6 h-6 text-[#FF0077]" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
                    <span className="text-sm text-gray-600 break-all">{item.content}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      )}

      </div>
      <Footer />
      <BottomNav />
    </div>
  );
}
