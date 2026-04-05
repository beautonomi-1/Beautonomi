import type { Metadata } from "next";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import AirFriendlyHero from "./components/hero";
import TheCarousel from "./components/carousel";
import GetStarted from "./components/get-started";
import OtherCities from "./components/other-cities";
import FAQ from "@/components/global/faq";
import { getPublicPageContent } from "@/lib/content/getPublicPageContent";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export interface FriendlyPageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, unknown>;
  };
}

export const metadata: Metadata = {
  title: "Beautonomi Friendly",
  description:
    "Discover how Beautonomi makes beauty services more accessible and customer-friendly.",
  alternates: {
    canonical: "/beautonomi-friendly",
    languages: getHreflangAlternateUrls("/beautonomi-friendly"),
  },
};

export const revalidate = 300;

const Page = async () => {
  const content = (await getPublicPageContent("beautonomi-friendly")) as FriendlyPageContent | null;

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full">
      <BeautonomiHeader />
      <div className="w-full max-w-full overflow-x-hidden">
      <AirFriendlyHero content={content} />
      <TheCarousel />
      <GetStarted />
      <div className="mb-40">
        <FAQ applyBgPrimary={false} />
      </div>
      <OtherCities />
      </div>
      <Footer />
      <BottomNav />
    </div>
  );
};

export default Page;
