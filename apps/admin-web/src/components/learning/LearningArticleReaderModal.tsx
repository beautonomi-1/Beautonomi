import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Lock } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  audienceLabel,
  LEARNING_ARTICLE_PROSE_CLASS,
  publicLearnApiUrl,
  publicLearnUrl,
  renderKbHtml,
  type KbArticleDetail,
  type KbAudience,
  type PublicLearnArticle,
} from "@/lib/learning";

type Props = {
  slug: string | null;
  isInternal: boolean;
  audience?: KbAudience | null;
  open: boolean;
  onClose: () => void;
};

export function LearningArticleReaderModal({ slug, isInternal, audience, open, onClose }: Props) {
  const articleQ = useQuery({
    queryKey: adminQueryKeys.knowledgeBase.readerModal(slug ?? "", isInternal),
    queryFn: async () => {
      if (!slug) throw new Error("Missing article slug");
      if (isInternal) {
        return adminApi.getJson<KbArticleDetail>(`/api/admin/learning/articles/${encodeURIComponent(slug)}`, {
          timeoutMs: 30_000,
        });
      }
      return adminApi.getJson<PublicLearnArticle>(publicLearnApiUrl(slug), { timeoutMs: 30_000 });
    },
    enabled: open && !!slug,
    staleTime: 5 * 60_000,
  });

  const article = articleQ.data;
  const html = useMemo(() => (article?.body ? renderKbHtml(article.body) : ""), [article?.body]);

  const title = article?.title ?? "Article";
  const summary = article?.summary ?? undefined;
  const resolvedAudience =
    article && "audience" in article && article.audience ? article.audience : audience ?? null;
  const categoryTitle =
    article?.learning_categories && "title" in article.learning_categories
      ? article.learning_categories.title
      : null;

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={title}
      description={summary}
      size="2xl"
      footer={
        <>
          {!isInternal && slug ? (
            <a
              href={publicLearnUrl(slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Open live article
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
          >
            Close
          </button>
        </>
      }
    >
      {articleQ.isLoading ? (
        <AdminPageSkeleton rows={8} />
      ) : articleQ.error ? (
        <AdminRetryBlock message={articleQ.error.message} onRetry={() => void articleQ.refetch()} />
      ) : !article ? (
        <p className="text-sm text-gray-600">Article not found.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-4 text-xs">
            {resolvedAudience ? (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600">
                {audienceLabel(resolvedAudience)}
              </span>
            ) : null}
            {isInternal ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                <Lock className="h-3 w-3" aria-hidden /> Internal — not visible to customers
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
                Customer/provider view
              </span>
            )}
            {categoryTitle ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{categoryTitle}</span>
            ) : null}
          </div>
          <article className={LEARNING_ARTICLE_PROSE_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
        </>
      )}
    </AdminModal>
  );
}
