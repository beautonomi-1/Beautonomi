import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/i18n/static-page-metadata";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import SearchBox from "./components/searchbox";
import CTA from "./components/cta";
import {
  getPublicPageContent,
  type PublicPageContent,
} from "@/lib/content/getPublicPageContent";

export interface HelpPageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, unknown>;
  };
}

export const revalidate = 300;

async function getHelpPageContent(): Promise<HelpPageContent | null> {
  return (await getPublicPageContent("help")) as PublicPageContent | null;
}

const Page = async () => {
  const content = await getHelpPageContent();

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full">
      <BeautonomiHeader />
      <div className="w-full max-w-full overflow-x-hidden px-4 sm:px-6">
        <div className="text-center pt-4 pb-0">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Help centre</p>
        </div>
        <SearchBox content={content} />
        <CTA content={content} />
      </div>
      <Footer />
      <BottomNav />
    </div>
  );
};

export async function generateMetadata(): Promise<Metadata> {
  return staticPageMetadata({
    path: "/help",
    titleKey: "web.seo.helpTitle",
    descriptionKey: "web.seo.helpDescription",
  });
}

export default Page;
