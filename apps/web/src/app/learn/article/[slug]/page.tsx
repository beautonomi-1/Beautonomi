"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";
import { LearnBreadcrumb } from "../../components/learn-breadcrumb";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";

interface ArticleData {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  body: string;
  content_format: string;
  published_at: string | null;
  learning_categories?: { id: string; title: string; slug: string };
  parents?: string[];
  parent_slugs?: string[];
  stats?: { view_count: number; helpful_yes_count: number; helpful_no_count: number };
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

  return (
    <article className="space-y-6 max-w-3xl">
      <LearnBreadcrumb
        parents={article.parents ?? (cat ? [cat.title] : [])}
        parentSlugs={article.parent_slugs ?? (cat ? [cat.slug] : [])}
        current={article.title}
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

      <div
        className="prose prose-zinc prose-sm max-w-none prose-headings:text-black prose-p:text-zinc-700 prose-a:text-[#ff0077]"
        dangerouslySetInnerHTML={{ __html: article.content_format === "markdown" ? article.body : article.body }}
      />

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
