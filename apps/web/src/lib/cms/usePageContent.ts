"use client";

import { useEffect, useState } from "react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";

export interface PageContentItem {
  id: string;
  page_slug: string;
  section_key: string;
  content_type: "text" | "html" | "json" | "image" | "video";
  content: string;
  metadata?: Record<string, any>;
  order: number;
  is_active: boolean;
}

export type PageContent = Record<string, PageContentItem[]>;

/**
 * Hook to fetch and use page content from CMS
 * 
 * @param pageSlug - The slug of the page (e.g., "home", "about", "help")
 * @returns Object with content, loading state, and error
 */
export function usePageContent(pageSlug: string) {
  const [content, setContent] = useState<PageContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadContent = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: PageContent;
          error: null;
        }>(`/api/public/pages/${pageSlug}`);
        setContent(response.data || {});
      } catch (err) {
        const errorMessage =
          err instanceof FetchTimeoutError
            ? "Request timed out. Please try again."
            : err instanceof FetchError
            ? err.message
            : "Failed to load page content";
        setError(errorMessage);
        console.error("Error loading page content:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (pageSlug) {
      loadContent();
    }
  }, [pageSlug]);

  /**
   * Get content for a specific section
   */
  const getSection = (sectionKey: string): PageContentItem | null => {
    if (!content || !content[sectionKey] || content[sectionKey].length === 0) {
      return null;
    }
    // Return the first item (or highest order if sorted)
    return content[sectionKey][0];
  };

  /**
   * Get all content items for a specific section
   */
  const getSectionAll = (sectionKey: string): PageContentItem[] => {
    if (!content || !content[sectionKey]) {
      return [];
    }
    return content[sectionKey];
  };

  /**
   * Get content value for a section (returns the content string)
   */
  const getSectionContent = (sectionKey: string, defaultValue: string = ""): string => {
    const item = getSection(sectionKey);
    return item?.content || defaultValue;
  };

  return {
    content,
    isLoading,
    error,
    getSection,
    getSectionAll,
    getSectionContent,
  };
}
