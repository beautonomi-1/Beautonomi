import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getLearnArticle } from "@/lib/data/getLearnArticle";
import { sanitizeLearnArticleHtml } from "@/lib/html/learn-article-html";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import { LearnBreadcrumb } from "../../components/learn-breadcrumb";
import ArticleFeedback from "./article-feedback";
import { LearnArticleHero } from "./learn-article-hero";
import { LearnArticleBody } from "./learn-article-body";

export const revalidate = 600;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getLearnArticle(slug);
  const origin = await getPublicSiteOriginFromHeaders();
  const path = `/learn/article/${encodeURIComponent(slug)}`;

  if (!article) {
    return {
      title: "Article Not Found · Learning Center",
      description: "The article you're looking for doesn't exist.",
      robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
    };
  }

  const title = `${article.title} · Learning Center`;
  const description = article.summary?.trim() || `Read ${article.title} on the Beautonomi Learning Center.`;

  return {
    title,
    description,
    robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
    alternates: {
      canonical: `${origin}${path}`,
      languages: getHreflangAlternateUrls(path),
    },
    openGraph: {
      title,
      description,
      url: `${origin}${path}`,
      siteName: "Beautonomi",
      type: "article",
      ...(article.image_url ? { images: [{ url: article.image_url }] } : {}),
    },
    twitter: {
      card: article.image_url ? "summary_large_image" : "summary",
      title,
      description,
      ...(article.image_url ? { images: [article.image_url] } : {}),
    },
  };
}

type TocItem = { id: string; text: string; level: number };

function processArticleBody(body: string, contentFormat: string): { html: string; toc: TocItem[] } {
  const rawHtml = contentFormat === "markdown" ? (marked.parse(body) as string) : body;

  const slugify = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section";

  const tocOut: TocItem[] = [];
  let counter = 0;
  const withIds = rawHtml.replace(
    /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_match: string, level: string, attrs: string, content: string) => {
      const text = content.replace(/<[^>]+>/g, "").trim();
      const id = text ? slugify(text) : `section-${++counter}`;
      tocOut.push({ id, text: text || "Section", level: parseInt(level, 10) });
      const existingId = attrs.match(/\bid=["']([^"']+)["']/i);
      const finalId = existingId ? existingId[1] : id;
      const newAttrs = existingId ? attrs : (attrs.trim() ? `${attrs} ` : "") + `id="${finalId}"`;
      return `<h${level} ${newAttrs.trim()}>${content}</h${level}>`;
    },
  );

  const withEmbeds = withIds.replace(
    /<iframe([^>]*)>([\s\S]*?)<\/iframe>/gi,
    (_m: string, attrs: string, inner: string) =>
      `<div class="learn-embed-video"><iframe${attrs}>${inner}</iframe></div>`,
  );

  return { html: sanitizeLearnArticleHtml(withEmbeds), toc: tocOut };
}

function ArticleToc({ toc }: { toc: TocItem[] }) {
  if (toc.length < 2) return null;

  return (
    <nav aria-label="In this article" className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-4 lg:sticky lg:top-24 lg:self-start">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">In this article</p>
      <ul className="space-y-1.5">
        {toc.map(({ id, text, level }) => (
          <li key={id} style={{ paddingLeft: level === 3 ? 12 : 0 }}>
            <a href={`#${id}`} className="text-sm text-zinc-700 hover:text-primary focus:outline-none focus:underline">
              {text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default async function LearnArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const article = await getLearnArticle(slug);

  if (!article) {
    notFound();
  }

  const { html, toc } = processArticleBody(article.body || "", article.content_format);

  const cat = article.learning_categories;
  const publishedAt = article.published_at
    ? new Date(article.published_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  const readMins = article.body ? Math.max(1, Math.ceil(article.body.split(/\s+/).length / 200)) : null;

  return (
    <article className="max-w-5xl w-full min-w-0 overflow-x-auto">
      <div className="space-y-6 max-w-3xl">
        <LearnBreadcrumb
          parents={article.parents ?? (cat ? [cat.title] : [])}
          parentSlugs={article.parent_slugs ?? (cat ? [cat.slug] : [])}
          current={article.title}
        />

        {cat && (
          <Link
            href={`/learn/${encodeURIComponent(cat.slug)}`}
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-primary"
          >
            <ChevronRight className="w-4 h-4 rotate-180" aria-hidden />
            Back to {cat.title}
          </Link>
        )}

        <LearnArticleHero title={article.title} imageUrl={article.image_url} heroVideoUrl={article.hero_video_url} />

        <header>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-black">{article.title}</h1>
          {article.summary && <p className="text-sm text-zinc-600 mt-2">{article.summary}</p>}
          {(publishedAt || readMins) && (
            <p className="mt-2 text-xs font-medium text-zinc-500 tabular-nums">
              {publishedAt && <>Last updated {publishedAt}</>}
              {publishedAt && readMins && " · "}
              {readMins != null && <>{readMins} min read</>}
            </p>
          )}
        </header>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
        <div className="min-w-0 space-y-6 max-w-3xl">
          {toc.length >= 2 ? (
            <div className="lg:hidden">
              <ArticleToc toc={toc} />
            </div>
          ) : null}

          <LearnArticleBody html={html} />

          {(article.category_nav.prev || article.category_nav.next) && (
            <nav aria-label="Article navigation" className="grid gap-3 border-t border-zinc-200/60 pt-6 sm:grid-cols-2">
              {article.category_nav.prev ? (
                <Link
                  href={`/learn/article/${encodeURIComponent(article.category_nav.prev.slug)}`}
                  className="group flex items-center gap-2 rounded-xl border border-zinc-200/70 px-4 py-3 text-sm hover:border-primary/25 hover:bg-primary/5"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-primary" />
                  <span className="min-w-0">
                    <span className="block text-xs text-zinc-500">Previous</span>
                    <span className="block truncate font-medium text-zinc-900">{article.category_nav.prev.title}</span>
                  </span>
                </Link>
              ) : (
                <div />
              )}
              {article.category_nav.next ? (
                <Link
                  href={`/learn/article/${encodeURIComponent(article.category_nav.next.slug)}`}
                  className="group flex items-center justify-end gap-2 rounded-xl border border-zinc-200/70 px-4 py-3 text-sm text-right hover:border-primary/25 hover:bg-primary/5 sm:col-start-2"
                >
                  <span className="min-w-0">
                    <span className="block text-xs text-zinc-500">Next</span>
                    <span className="block truncate font-medium text-zinc-900">{article.category_nav.next.title}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-primary" />
                </Link>
              ) : null}
            </nav>
          )}

          {(article.related_articles?.length ?? 0) > 0 && (
            <section className="pt-6 border-t border-zinc-200/50">
              <h2 className="text-sm font-semibold text-zinc-900 mb-3">Related articles</h2>
              <ul className="space-y-2">
                {article.related_articles.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/learn/article/${encodeURIComponent(r.slug)}`}
                      className="group flex items-center gap-2 text-sm text-zinc-700 hover:text-primary"
                    >
                      <span className="flex-1 min-w-0">{r.title}</span>
                      <ChevronRight className="w-4 h-4 shrink-0 opacity-70 group-hover:opacity-100" />
                    </Link>
                    {r.summary && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{r.summary}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ArticleFeedback slug={slug} />
        </div>

        {toc.length >= 2 ? (
          <aside className="hidden lg:block">
            <ArticleToc toc={toc} />
          </aside>
        ) : null}
      </div>
    </article>
  );
}
