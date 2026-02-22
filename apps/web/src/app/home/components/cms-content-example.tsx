/**
 * Example: How to use CMS content in public pages
 * 
 * This is a reference component showing how to integrate CMS content
 * into public pages. You can use this pattern in any public page.
 */

"use client";
import { usePageContent } from "@/lib/cms/usePageContent";

export default function CMSContentExample() {
  // Fetch content for the "home" page
  const { getSectionContent, isLoading, error } = usePageContent("home");

  if (isLoading) {
    return <div>Loading content...</div>;
  }

  if (error) {
    // Fallback to default content if CMS fails
    console.error("CMS Error:", error);
  }

  return (
    <div>
      {/* Example 1: Simple text content with fallback */}
      <h1>{getSectionContent("hero_title", "Welcome to Beautonomi")}</h1>

      {/* Example 2: HTML content */}
      <div
        dangerouslySetInnerHTML={{
          __html: getSectionContent("hero_description", "<p>Default description</p>"),
        }}
      />

      {/* Example 3: Multiple content items */}
      <section>
        <h2>{getSectionContent("news_section_title", "News for you")}</h2>
        {/* Render news items from CMS */}
      </section>
    </div>
  );
}
