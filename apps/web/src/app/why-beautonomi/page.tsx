import type { Metadata } from "next";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import WhyBeautonomiHero from "./components/hero";
import ProofBand from "./components/proof-band";
import Features from "./components/features";
import StorySection from "./components/story-section";
import Benefits from "./components/benefits";
import CTABanner from "./components/cta-banner";
import FAQ from "@/components/global/faq";
import { getPublicPageContent } from "@/lib/content/getPublicPageContent";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Why Beautonomi",
  description:
    "Learn why customers and beauty professionals choose Beautonomi.",
  alternates: {
    canonical: "/why-beautonomi",
    languages: getHreflangAlternateUrls("/why-beautonomi"),
  },
};

export const revalidate = 300;

export default async function WhyBeautonomiPage() {
  const content = await getPublicPageContent("why-beautonomi");

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full">
      <BeautonomiHeader />
      <div className="w-full max-w-full overflow-x-hidden">
        <WhyBeautonomiHero content={content} />
        <ProofBand content={content} />
        <Features content={content} />
        <StorySection content={content} />
        <Benefits content={content} />
        <CTABanner content={content} />
        <FAQ applyBgPrimary={false} />
      </div>
      <Footer />
      <BottomNav />
    </div>
  );
}
