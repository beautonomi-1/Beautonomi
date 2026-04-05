import type { Metadata } from "next";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import SearchBox from "./components/searchbox";
import CTA from "./components/cta";
import {
  getPublicPageContent,
  type PublicPageContent,
} from "@/lib/content/getPublicPageContent";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export interface HelpPageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, unknown>;
  };
}

export const metadata: Metadata = {
  title: "Help Centre",
  description:
    "Find answers, browse common help articles, and contact Beautonomi support.",
  alternates: {
    canonical: "/help",
    languages: getHreflangAlternateUrls("/help"),
  },
};

export const revalidate = 300;

async function getHelpPageContent(): Promise<HelpPageContent | null> {
  return (await getPublicPageContent("help")) as PublicPageContent | null;
}

const Page = async () => {
  const content = await getHelpPageContent();

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader />
      <div className="text-center pt-4 pb-0">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Help centre</p>
      </div>
      <SearchBox content={content} />
      <CTA content={content} />
      <Footer />
      <BottomNav />
    </div>
  );
};

export default Page;
