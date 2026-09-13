import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import AirFriendlyHero from "./components/hero";
import TheCarousel from "./components/carousel";
import GetStarted from "./components/get-started";
import OtherCities from "./components/other-cities";
import FAQ from "@/components/global/faq";
import { getPublicPageContent } from "@/lib/content/getPublicPageContent";

export interface FriendlyPageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, unknown>;
  };
}

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

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/beautonomi-friendly",
    titleKey: "web.seo.beautonomiFriendlyTitle",
    descriptionKey: "web.seo.beautonomiFriendlyDescription",
  });
}

export default Page;
