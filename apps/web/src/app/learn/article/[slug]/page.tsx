import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { ChevronRight } from "lucide-react";
import { getLearnArticle } from "@/lib/data/getLearnArticle";
import { sanitizeLearnArticleHtml } from "@/lib/html/learn-article-html";
import { getPublicSiteOriginFromHeaders } from "@/lib/seo/public-site-origin";
import { getHreflangAlternateUrls } from "@/lib/seo/host-config";
import { LearnBreadcrumb } from "../../components/learn-breadcrumb";
import ArticleFeedback from "./article-feedback";
import { LearnArticleHero } from "./learn-article-hero";

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
    <article className="space-y-6 max-w-3xl w-full min-w-0 overflow-x-auto">
      <LearnBreadcrumb
        parents={article.parents ?? (cat ? [cat.title] : [])}
        parentSlugs={article.parent_slugs ?? (cat ? [cat.slug] : [])}
        current={article.title}
      />

      {cat && (
        <Link
          href={`/learn/${encodeURIComponent(cat.slug)}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-[#ff0077]"
        >
          <ChevronRight className="w-4 h-4 rotate-180" aria-hidden />
          Back to {cat.title}
        </Link>
      )}

      <LearnArticleHero
        title={article.title}
        imageUrl={article.image_url}
        heroVideoUrl={article.hero_video_url}
      />

      <header>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-black">{article.title}</h1>
        {article.summary && <p className="text-sm text-zinc-600 mt-2">{article.summary}</p>}
        {(publishedAt || readMins) && (
          <p className="mt-2 text-xs font-mono text-zinc-500 tabular-nums">
            {publishedAt && <>Last updated {publishedAt}</>}
            {publishedAt && readMins && " · "}
            {readMins != null && <>{readMins} min read</>}
          </p>
        )}
      </header>

      {toc.length >= 2 && (
        <nav aria-label="In this article" className="rounded-lg border border-zinc-200/80 bg-zinc-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">In this article</p>
          <ul className="space-y-1.5">
            {toc.map(({ id, text, level }) => (
              <li key={id} style={{ paddingLeft: level === 3 ? 12 : 0 }}>
                <a
                  href={`#${id}`}
                  className="text-sm text-zinc-700 hover:text-[#ff0077] focus:outline-none focus:underline"
                >
                  {text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div
        className={[
          "learn-article-body prose prose-zinc prose-sm max-w-none",
          "prose-headings:text-black prose-p:text-zinc-700 prose-a:text-[#ff0077]",
          "prose-p:my-3 first:prose-p:mt-0",
          "[&_img]:block [&_img]:w-full [&_img]:max-w-full [&_img]:h-auto [&_img]:my-5 [&_img]:rounded-lg [&_img]:object-contain [&_img]:bg-zinc-100",
          "[&_video]:block [&_video]:w-full [&_video]:max-w-full [&_video]:my-5 [&_video]:rounded-lg [&_video]:bg-zinc-100",
          "[&_iframe]:block [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:my-5 [&_iframe]:rounded-lg [&_iframe]:min-h-[200px]",
          "[&_.learn-embed-video]:relative [&_.learn-embed-video]:aspect-video [&_.learn-embed-video]:w-full [&_.learn-embed-video]:block [&_.learn-embed-video]:my-5 [&_.learn-embed-video]:rounded-lg [&_.learn-embed-video]:overflow-hidden [&_.learn-embed-video_iframe]:absolute [&_.learn-embed-video_iframe]:inset-0 [&_.learn-embed-video_iframe]:m-0 [&_.learn-embed-video_iframe]:w-full [&_.learn-embed-video_iframe]:h-full [&_.learn-embed-video_iframe]:rounded-lg",
          "[&_picture]:block [&_picture]:my-5 [&_picture]:rounded-lg [&_picture]:overflow-hidden",
          "[&_picture_img]:my-0 [&_picture_img]:w-full [&_picture_img]:max-w-full [&_picture_img]:h-auto",
          "[&_figure]:block [&_figure]:my-5 [&_figure]:max-w-full [&_figure]:rounded-lg [&_figure]:overflow-hidden",
          "[&_figure_img]:my-0 [&_figure_img]:w-full [&_figure_img]:max-w-full [&_figure_img]:h-auto [&_figure_img]:rounded-t-lg",
          "[&_figcaption]:mt-2 [&_figcaption]:text-sm [&_figcaption]:text-zinc-500 [&_figcaption]:text-center [&_figcaption]:italic",
          "[&_table]:block [&_table]:w-full [&_table]:text-sm [&_table]:max-w-full",
          "[&_pre]:overflow-x-auto [&_pre]:text-xs [&_pre]:sm:text-sm [&_pre]:max-w-full",
        ].join(" ")}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {(article.related_articles?.length ?? 0) > 0 && (
        <section className="pt-6 border-t border-zinc-200/50">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3">Related articles</h2>
          <ul className="space-y-2">
            {article.related_articles.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/learn/article/${encodeURIComponent(r.slug)}`}
                  className="group flex items-center gap-2 text-sm text-zinc-700 hover:text-[#ff0077]"
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
    </article>
  );
}
