"use client";

import React, { useEffect, useState } from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import { fetcher } from "@/lib/http/fetcher";
import Link from "next/link";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, unknown>;
  };
}

export default function ResourcesPage() {
  const [content, setContent] = useState<PageContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const response = await fetcher.get<{ data: PageContent }>(
          "/api/public/page-content?page_slug=resources"
        );
        setContent(response.data);
      } catch {
        // Use default content if CMS has no resources page
      } finally {
        setIsLoading(false);
      }
    };
    loadContent();
  }, []);

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader />
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-16">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
          Resources
        </p>
        <h1 className="text-2xl md:text-3xl font-normal text-gray-900 mb-6">
          Beautonomi Connect &amp; more
        </h1>

        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-5/6" />
            <div className="h-4 bg-gray-200 rounded w-4/6" />
          </div>
        ) : content && Object.keys(content).length > 0 ? (
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
      <Footer />
      <BottomNav />
    </div>
  );
}
