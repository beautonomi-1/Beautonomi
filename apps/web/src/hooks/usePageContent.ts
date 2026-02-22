import { useState, useEffect } from "react";
import { fetcher } from "@/lib/http/fetcher";

interface PageContent {
  id: string;
  page_slug: string;
  section_key: string;
  content_type: "text" | "html" | "json" | "image" | "video";
  content: string;
  metadata?: Record<string, any>;
  order: number;
  is_active: boolean;
}

interface PageContentGrouped {
  [sectionKey: string]: PageContent[];
}

/**
 * Hook to fetch page content from the API
 * Returns content grouped by section_key
 */
export function usePageContent(pageSlug: string) {
  const [content, setContent] = useState<PageContentGrouped>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: PageContentGrouped | null;
          error: null | { message: string; code: string };
        }>(`/api/public/pages/${pageSlug}`);

        if (response.data) {
          setContent(response.data);
        } else {
          setContent({});
        }
      } catch (err) {
        console.error(`Error fetching page content for ${pageSlug}:`, err);
        setError("Failed to load content");
        setContent({});
      } finally {
        setIsLoading(false);
      }
    };

    if (pageSlug) {
      fetchContent();
    }
  }, [pageSlug]);

  /**
   * Get content for a specific section
   * Returns the first item if multiple exist, or null if not found
   */
  const getSectionContent = (sectionKey: string): string | null => {
    const section = content[sectionKey];
    if (!section || section.length === 0) {
      return null;
    }
    // Return the first item's content
    return section[0].content;
  };

  /**
   * Get all content items for a specific section
   */
  const getSectionItems = (sectionKey: string): PageContent[] => {
    return content[sectionKey] || [];
  };

  return {
    content,
    isLoading,
    error,
    getSectionContent,
    getSectionItems,
  };
}
