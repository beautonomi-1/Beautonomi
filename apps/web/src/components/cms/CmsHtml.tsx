"use client";

import { sanitizeCmsPageHtml } from "@/lib/html/cms-page-html";

type CmsHtmlProps = {
  html: string;
  className?: string;
  /** Default span — use div for block-level CMS blocks */
  as?: "span" | "div";
};

/**
 * Renders tenant CMS HTML (e.g. page_content) with a strict allowlist.
 * Prefer this over raw `dangerouslySetInnerHTML` for user-editable copy.
 */
export function CmsHtml({ html, className, as: Tag = "span" }: CmsHtmlProps) {
  const safe = sanitizeCmsPageHtml(html);
  if (!safe.trim()) return null;
  return (
    <Tag
      className={className}
      // eslint-disable-next-line react/no-danger -- sanitized via sanitize-html
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
