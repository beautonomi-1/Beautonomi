"use client";

import React, { useEffect, useState } from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import ExploreMore from "./components/explore-more";
import SearchBox from "./components/searchbox";
import TopArticles from "./components/top-articles";
import TabComponent from "@/components/tabs";
import { fetcher } from "@/lib/http/fetcher";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

const Page = () => {
  const [_content, setContent] = useState<PageContent | null>(null);
  const [_isLoading, _setIsLoading] = useState(false);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const response = await fetcher.get<{ data: PageContent }>("/api/public/page-content?page_slug=help");
        setContent(response.data);
      } catch (error) {
        console.error("Failed to load help page content:", error);
        // Continue with default content if CMS fails
      }
    };
    loadContent();
  }, []);

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader />
      <div className="text-center pt-4 pb-0">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Help centre</p>
      </div>
      <SearchBox />
      <div id="help-tabs">
        <TabComponent />
      </div>
      <TopArticles />
      <ExploreMore />
      <Footer />
      <BottomNav />
    </div>
  );
};

export default Page;
