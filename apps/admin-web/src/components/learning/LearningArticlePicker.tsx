import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Plus, Search } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { audienceLabel, publicLearnUrl, type KbArticleResult, type KbAudience } from "@/lib/learning";

type Props = {
  /** Restrict/boost results for the audience you're helping (customer/provider). */
  audience?: KbAudience | null;
  /** Include internal runbooks in results. Default false (safe for customer-facing replies). */
  includeInternal?: boolean;
  /** When provided, an "Insert link" action appears on each result. */
  onInsert?: (article: KbArticleResult) => void;
  /** Show the "Open" link to the in-admin reader. Default true. */
  showOpen?: boolean;
  placeholder?: string;
  /** Initial query (e.g. ticket subject). */
  initialQuery?: string;
  /** Cap visible results. Default 8. */
  limit?: number;
  enabled?: boolean;
};

export function LearningArticlePicker({
  audience = null,
  includeInternal = false,
  onInsert,
  showOpen = true,
  placeholder = "Search the knowledge base…",
  initialQuery = "",
  limit = 8,
  enabled = true,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery.trim());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const signature = useMemo(
    () => JSON.stringify({ q: debounced, audience, includeInternal, limit }),
    [debounced, audience, includeInternal, limit],
  );

  const searchQ = useQuery({
    queryKey: adminQueryKeys.knowledgeBase.search(signature),
    queryFn: () => {
      const params = new URLSearchParams();
      if (debounced) params.set("q", debounced);
      if (audience) params.set("audience", audience);
      params.set("include_internal", includeInternal ? "true" : "false");
      params.set("limit", String(limit));
      return adminApi.getJson<KbArticleResult[]>(`/api/admin/learning/search?${params.toString()}`, {
        timeoutMs: 30_000,
      });
    },
    enabled,
    staleTime: 30_000,
  });

  const results = searchQ.data ?? [];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>
      <div className="max-h-72 space-y-2 overflow-auto">
        {searchQ.isLoading ? (
          <p className="px-1 py-2 text-xs text-gray-500">Searching…</p>
        ) : results.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-500">
            {debounced ? "No matching articles." : "Type to search, or browse recent articles below."}
          </p>
        ) : (
          results.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-gray-200 bg-white p-2.5 text-sm shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{a.title}</p>
                  {a.summary ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{a.summary}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                    {audienceLabel(a.audience)}
                  </span>
                  {a.is_internal ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      Internal
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {onInsert ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    disabled={a.is_internal}
                    title={a.is_internal ? "Internal articles can't be sent to customers" : "Insert a link to this article"}
                    onClick={() => onInsert(a)}
                  >
                    <Plus className="h-3 w-3" />
                    Insert link
                  </button>
                ) : null}
                {showOpen ? (
                  <Link
                    to={adminSpaTo(`/admin/knowledge-base/${a.slug}`)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Read
                  </Link>
                ) : null}
                {!a.is_internal ? (
                  <a
                    href={publicLearnUrl(a.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-800"
                  >
                    Live <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
          ))
        )}
        {searchQ.isError ? (
          <p className="px-1 py-2 text-xs text-red-600">Could not load articles. Try again.</p>
        ) : null}
      </div>
    </div>
  );
}
