import type { Metadata } from "next";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import Link from "next/link";
import { getPublicPageContent } from "@/lib/content/getPublicPageContent";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Explore Beautonomi resources, tools, and guides for customers and beauty partners.",
  alternates: {
    canonical: "/resources",
    languages: getHreflangAlternateUrls("/resources"),
  },
};

export const revalidate = 300;

export default async function ResourcesPage() {
  const content = await getPublicPageContent("resources");
  const hasContent = !!content && Object.keys(content).length > 0;

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full">
      <BeautonomiHeader />
      <div className="w-full max-w-full overflow-x-hidden">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-16">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
          Resources
        </p>
        <h1 className="text-2xl md:text-3xl font-normal text-gray-900 mb-6">
          Beautonomi Connect &amp; more
        </h1>

        {hasContent ? (
          <div className="prose prose-gray max-w-none">
            {Object.entries(content).map(([key, section]) => (
              <div key={key}>
                {section.content_type === "html" ? (
                  <div dangerouslySetInnerHTML={{ __html: section.content }} />
                ) : (
                  <p className="whitespace-pre-wrap">{section.content}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <>
            <p className="text-gray-600 mb-6">
              Beautonomi Connect brings phone calls, text messages, and web chats
              to your business—so you can stay in touch with clients the way they
              prefer.
            </p>
            <p className="text-gray-600 mb-8">
              Learn more about partnering with us and the tools we offer.
            </p>
            <Link
              href="/become-a-partner"
              className="inline-block text-[#FF0077] font-medium hover:underline"
            >
              Become a partner →
            </Link>
          </>
        )}
      </div>
      </div>
      <Footer />
      <BottomNav />
    </div>
  );
}
