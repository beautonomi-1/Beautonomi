"use client";

import { sanitizePricingFeatureHtml } from "@/lib/html/pricing-feature-html";

type PricingFeatureHtmlProps = {
  html: string;
  className?: string;
};

/** Renders a sanitized marketing bullet (supports rich text from CMS / Quill). */
export function PricingFeatureHtml({ html, className }: PricingFeatureHtmlProps) {
  const safe = sanitizePricingFeatureHtml(html);
  if (!safe) return null;
  return (
    <span
      className={className}
      // eslint-disable-next-line react/no-danger -- sanitized with DOMPurify
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
