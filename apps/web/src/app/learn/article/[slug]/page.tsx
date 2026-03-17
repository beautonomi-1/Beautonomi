"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { marked } from "marked";
import { Button } from "@/components/ui/button";
import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";
import { LearnBreadcrumb } from "../../components/learn-breadcrumb";
import { ThumbsUp, ThumbsDown, Check, ChevronRight } from "lucide-react";

interface RelatedArticle {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
}

interface ArticleData {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  body: string;
  content_format: string;
  published_at: string | null;
  image_url?: string | null;
  learning_categories?: { id: string; title: string; slug: string };
  parents?: string[];
  parent_slugs?: string[];
  stats?: { view_count: number; helpful_yes_count: number; helpful_no_count: number };
  related_articles?: RelatedArticle[];
}

export default function LearnArticlePage() {
  const params = useParams();
  const slug = params.slug as string;
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackSent, setFeedbackSent] = useState<boolean | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/learn/article/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((res) => setArticle(res.data ?? null))
      .catch(() => setArticle(null))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!article) return;
    const title = `${article.title} · Learning Center`;
    const desc = article.summary?.trim() ?? "";
    const canonicalUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/learn/article/${encodeURIComponent(article.slug)}`
        : "";
    const imageUrl = article.image_url?.trim() || "";

    document.title = title;

    const setMeta = (attr: "name" | "property", key: string, content: string) => {
      if (!content) return;
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        el.setAttribute("data-learn-article", "1");
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    const removeMeta = (attr: "name" | "property", key: string) => {
      const el = document.querySelector(`meta[${attr}="${key}"][data-learn-article="1"]`);
      if (el) el.remove();
    };

    if (desc) setMeta("name", "description", desc);
    setMeta("property", "og:title", title);
    if (desc) setMeta("property", "og:description", desc);
    setMeta("property", "og:type", "article");
    if (canonicalUrl) setMeta("property", "og:url", canonicalUrl);
    if (imageUrl) setMeta("property", "og:image", imageUrl);
    setMeta("name", "twitter:card", imageUrl ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", title);
    if (desc) setMeta("name", "twitter:description", desc);
    if (imageUrl) setMeta("name", "twitter:image", imageUrl);

    return () => {
      document.title = "Learning Center";
      removeMeta("name", "description");
      ["og:title", "og:description", "og:type", "og:url", "og:image"].forEach((k) => removeMeta("property", k));
      ["twitter:card", "twitter:title", "twitter:description", "twitter:image"].forEach((k) => removeMeta("name", k));
    };
  }, [article]);

  const sendFeedback = async (helpful: boolean) => {
    if (feedbackSent !== null) return;
    try {
      await fetch(`/api/public/learn/article/${encodeURIComponent(slug)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful }),
      });
      setFeedbackSent(helpful);
    } catch {
      setFeedbackSent(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-center py-4">
          <BeautonomiLoadingIcon size={48} />
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-2/3 bg-zinc-200 rounded-xl" />
          <div className="h-4 w-1/2 bg-zinc-100 rounded-xl" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-zinc-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div>
        <p className="text-sm text-zinc-600">Article not found.</p>
        <Link href="/learn" className="text-[#ff0077] underline mt-2 inline-block text-sm">
          Back to Learning Center
        </Link>
      </div>
    );
  }

  const cat = article.learning_categories;
  const publishedAt = article.published_at
    ? new Date(article.published_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  const readMins = article.body ? Math.max(1, Math.ceil(article.body.split(/\s+/).length / 200)) : null;

  const bodyHtml = useMemo(() => {
    if (!article.body) return "";
    return article.content_format === "markdown"
      ? (marked.parse(article.body) as string)
      : article.body;
  }, [article.body, article.content_format]);

  const { htmlWithHeadingIds, toc } = useMemo(() => {
    const slugify = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "section";
    const toc: { id: string; text: string; level: number }[] = [];
    let counter = 0;
    const html = bodyHtml.replace(
      /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi,
      (_match, level: string, attrs: string, content: string) => {
        const text = content.replace(/<[^>]+>/g, "").trim();
        const id = text ? slugify(text) : `section-${++counter}`;
        toc.push({ id, text: text || "Section", level: parseInt(level, 10) });
        const existingId = attrs.match(/\bid=["']([^"']+)["']/i);
        const finalId = existingId ? existingId[1] : id;
        const newAttrs = existingId ? attrs : (attrs.trim() ? `${attrs} ` : "") + `id="${finalId}"`;
        return `<h${level} ${newAttrs.trim()}>${content}</h${level}>`;
      }
    );
    const withEmbedWrappers = html.replace(
      /<iframe([^>]*)>([\s\S]*?)<\/iframe>/gi,
      (_m: string, attrs: string, inner: string) =>
        `<div class="learn-embed-video"><iframe${attrs}>${inner}</iframe></div>`
    );
    return { htmlWithHeadingIds: withEmbedWrappers, toc };
  }, [bodyHtml]);

  return (
    <article className="space-y-6 max-w-3xl">
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

      {article.image_url && (
        <div className="rounded-lg overflow-hidden bg-zinc-100">
          <img
            src={article.image_url}
            alt=""
            className="w-full h-auto object-cover max-h-[320px]"
          />
        </div>
      )}

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
          // Embedded media: match article text margins, stay in context, rounded
          "[&_img]:block [&_img]:w-full [&_img]:max-w-full [&_img]:h-auto [&_img]:my-5 [&_img]:rounded-lg [&_img]:object-contain [&_img]:bg-zinc-100",
          "[&_video]:block [&_video]:w-full [&_video]:max-w-full [&_video]:my-5 [&_video]:rounded-lg [&_video]:bg-zinc-100",
          "[&_iframe]:block [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:my-5 [&_iframe]:rounded-lg [&_iframe]:min-h-[200px]",
          "[&_.learn-embed-video]:relative [&_.learn-embed-video]:aspect-video [&_.learn-embed-video]:w-full [&_.learn-embed-video]:block [&_.learn-embed-video]:my-5 [&_.learn-embed-video]:rounded-lg [&_.learn-embed-video]:overflow-hidden [&_.learn-embed-video_iframe]:absolute [&_.learn-embed-video_iframe]:inset-0 [&_.learn-embed-video_iframe]:m-0 [&_.learn-embed-video_iframe]:w-full [&_.learn-embed-video_iframe]:h-full [&_.learn-embed-video_iframe]:rounded-lg",
          "[&_picture]:block [&_picture]:my-5 [&_picture]:rounded-lg [&_picture]:overflow-hidden",
          "[&_picture_img]:my-0 [&_picture_img]:w-full [&_picture_img]:max-w-full [&_picture_img]:h-auto",
          "[&_figure]:block [&_figure]:my-5 [&_figure]:max-w-full [&_figure]:rounded-lg [&_figure]:overflow-hidden",
          "[&_figure_img]:my-0 [&_figure_img]:w-full [&_figure_img]:max-w-full [&_figure_img]:h-auto [&_figure_img]:rounded-t-lg",
          "[&_figcaption]:mt-2 [&_figcaption]:text-sm [&_figcaption]:text-zinc-500 [&_figcaption]:text-center [&_figcaption]:italic",
        ].join(" ")}
        dangerouslySetInnerHTML={{ __html: htmlWithHeadingIds }}
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
                {r.summary && (
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{r.summary}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pt-6 border-t border-zinc-200/50">
        <p className="text-sm font-medium text-black mb-2">Was this helpful?</p>
        <div className="flex gap-2 flex-wrap items-center">
          <motion.div whileTap={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
            <Button
              variant={feedbackSent === true ? "default" : "outline"}
              size="sm"
              className={feedbackSent === true ? "bg-[#ff0077] hover:bg-[#ff0077]/90" : "border-zinc-200/50 active:scale-[1.02]"}
              onClick={() => sendFeedback(true)}
              disabled={feedbackSent !== null}
            >
              <ThumbsUp className="h-4 w-4 mr-1" />
              Yes
            </Button>
          </motion.div>
          <motion.div whileTap={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
            <Button
              variant={feedbackSent === false ? "secondary" : "outline"}
              size="sm"
              className="border-zinc-200/50 active:scale-[1.02]"
              onClick={() => sendFeedback(false)}
              disabled={feedbackSent !== null}
            >
              <ThumbsDown className="h-4 w-4 mr-1" />
              No
            </Button>
          </motion.div>
          {feedbackSent !== null && (
            <motion.div
              className="flex items-center gap-2 text-zinc-600"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-4 w-4" />
              </span>
              <span className="text-xs">Thanks for your feedback.</span>
            </motion.div>
          )}
        </div>
      </section>
    </article>
  );
}
