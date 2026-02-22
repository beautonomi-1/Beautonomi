"use client";

import React, { useEffect, useState } from 'react'
import Banner from './components/banner'
import FeatureCards from './components/feature-cards'
import PickingDesigns from './components/picking-design'
import FAQ from '@/components/global/faq'
import GiftsHero from './components/gifts-hero'
import Navbar4 from '@/components/global/Navbar4'
import { fetcher } from '@/lib/http/fetcher'

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

const Page = () => {
  const [content, setContent] = useState<PageContent | null>(null);
  const [_isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const response = await fetcher.get<{ data: PageContent }>('/api/public/page-content?page_slug=gift-card');
        setContent(response.data);
      } catch (error) {
        console.error('Failed to load gift card page content:', error);
        // Continue with default content if CMS fails
      } finally {
        setIsLoading(false);
      }
    };
    loadContent();
  }, []);

  return (
    <div>
      <Navbar4/>
      <GiftsHero content={content} />
      <PickingDesigns content={content} />
      <FeatureCards content={content} />
      <Banner content={content} />
      <FAQ applyBgPrimary={false}/>
    </div>
  )
}

export default Page
