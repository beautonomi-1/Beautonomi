/**
 * Internal Knowledge Base helpers (admin SPA).
 *
 * Articles are authored in the public Learning Center but read here by internal
 * staff (including `is_internal` runbooks). The live, interactive mockups render
 * only on the public `/learn` site, so in the admin reader we replace the
 * `data-learn-mockup` markers with a labelled placeholder + a link to the live
 * article.
 */

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

/** Public Learning Center URL for an article slug (same origin as the admin SPA). */
export function publicLearnUrl(slug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/learn/article/${slug}`;
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
