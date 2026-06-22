/**
 * Internal Knowledge Base helpers (admin SPA).
 *
 * Articles are authored in the public Learning Center but read here by internal
 * staff (including `is_internal` runbooks). The live, interactive mockups render
 * only on the public `/learn` site, so in the admin reader we replace the
 * `data-learn-mockup` markers with a labelled placeholder + a link to the live
 * article.
 */

import { publicSiteOrigin } from "@/config/publicEnv";

export type KbAudience = "general" | "customer" | "provider" | "internal";

export type KbArticleResult = {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  summary: string | null;
  audience: KbAudience;
  is_internal: boolean;
  status: string;
  published_at: string | null;
  rank: number;
  content_type: string | null;
};

export type KbCategorySection = {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  audience: KbAudience;
  visibility: "public" | "internal";
  sort_order: number;
  articles: Array<{
    id: string;
    category_id: string;
    title: string;
    slug: string;
    summary: string | null;
    audience: KbAudience;
    is_internal: boolean;
    status: string;
    content_type: string | null;
    updated_at: string;
  }>;
};

export type KbBrowseResponse = {
  sections: KbCategorySection[];
  total_articles: number;
  internal_articles: number;
};

export type KbArticleDetail = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  body: string;
  content_format: "html" | "markdown";
  content_type: string | null;
  audience: KbAudience;
  is_internal: boolean;
  status: string;
  updated_at: string;
  learning_categories?: {
    id: string;
    title: string;
    slug: string;
    audience: KbAudience;
    visibility: "public" | "internal";
  } | null;
};

/** Article payload from the public Learning Center API (customer/provider-facing). */
export type PublicLearnArticle = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  body: string;
  content_format: "html" | "markdown";
  content_type: string | null;
  published_at: string | null;
  learning_categories?: {
    id: string;
    title: string;
    slug: string;
  } | null;
};

/** Shared prose styling for rendered learning article HTML in admin readers. */
export const LEARNING_ARTICLE_PROSE_CLASS =
  "text-sm leading-relaxed text-gray-700 " +
  "[&_h2]:mt-7 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 " +
  "[&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-gray-900 " +
  "[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:mt-1 [&_a]:font-medium [&_a]:text-purple-700 [&_a]:underline [&_strong]:font-semibold [&_strong]:text-gray-900";

/** Public Learning Center URL for an article slug (customer/provider web app, not admin). */
export function publicLearnUrl(slug: string): string {
  const origin = publicSiteOrigin();
  const path = `/learn/article/${encodeURIComponent(slug)}`;
  return origin ? `${origin}${path}` : path;
}

/** Public API URL for staff preview reads (skips view-count tracking). */
export function publicLearnApiUrl(slug: string): string {
  return `/api/public/learn/article/${encodeURIComponent(slug)}?track=0`;
}

const AUDIENCE_LABEL: Record<KbAudience, string> = {
  general: "General",
  customer: "Customer",
  provider: "Provider",
  internal: "Internal",
};

export function audienceLabel(a: KbAudience): string {
  return AUDIENCE_LABEL[a] ?? a;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function placeholderHtml(id: string, caption: string): string {
  const captionHtml = caption
    ? `<div style="margin-top:6px;font-size:13px;color:#6b7280;">${escapeHtml(caption)}</div>`
    : "";
  return `<div style="margin:20px 0;border:1px dashed #d1d5db;border-radius:14px;background:#f9fafb;padding:16px 18px;">
  <div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#9333ea;">Interactive preview</div>
  <div style="margin-top:4px;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(id)}</div>
  ${captionHtml}
  <div style="margin-top:8px;font-size:12px;color:#9ca3af;">Open the live article to view the interactive mockup.</div>
</div>`;
}

/**
 * Replace `data-learn-mockup` markers with placeholder cards for the admin reader.
 * Handles the canonical `mockup` then `caption` order plus any caption-less leftovers.
 */
export function renderKbHtml(body: string): string {
  if (!body) return "";
  let out = body.replace(
    /<div\s+data-learn-mockup="([^"]+)"(?:\s+data-caption="([^"]*)")?\s*><\/div>/g,
    (_match, id: string, caption?: string) => placeholderHtml(id, caption ?? ""),
  );
  // Any remaining markers in a different attribute order.
  out = out.replace(/<div\s+[^>]*data-learn-mockup="([^"]+)"[^>]*><\/div>/g, (_m, id: string) =>
    placeholderHtml(id, ""),
  );
  return out;
}
