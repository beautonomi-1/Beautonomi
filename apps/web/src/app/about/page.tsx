"use client";

import React, { useEffect, useState } from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import { fetcher } from "@/lib/http/fetcher";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

export default function AboutPage() {
  const [content, setContent] = useState<PageContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const response = await fetcher.get<{ data: PageContent }>("/api/public/page-content?page_slug=about");
        setContent(response.data);
      } catch (error) {
        console.error("Failed to load about page content:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadContent();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white pb-20 md:pb-0">
        <BeautonomiHeader />
        <div className="container mx-auto px-4 py-16">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
        <Footer />
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader />
      <div className="container mx-auto px-4 py-16">
        {content?.hero_title && (
          <h1 className="text-4xl md:text-5xl font-bold mb-8 text-gray-900">
            {content.hero_title.content}
          </h1>
        )}
        {content?.hero_content && content.hero_content.content_type === "html" ? (
          <div 
            className="prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: content.hero_content.content }}
          />
        ) : content?.hero_content ? (
          <p className="text-lg text-gray-700 whitespace-pre-line">
            {content.hero_content.content}
          </p>
        ) : (
          <div className="prose prose-lg max-w-none">
            <h2>About Beautonomi</h2>
            <p>Welcome to Beautonomi - your trusted platform for beauty and wellness services.</p>
          </div>
        )}
        {content?.sections && content.sections.content_type === "json" && (
          <div className="mt-12 space-y-8">
            {JSON.parse(content.sections.content).map((section: any, index: number) => (
              <div key={index} className="mb-8">
                {section.title && (
                  <h2 className="text-2xl md:text-3xl font-semibold mb-4 text-gray-900">
                    {section.title}
                  </h2>
                )}
                {section.content && (
                  <div 
                    className="prose prose-lg max-w-none"
                    dangerouslySetInnerHTML={{ __html: section.content }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
      <BottomNav />
    </div>
  );
}
