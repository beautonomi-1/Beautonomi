import { useEffect, useState } from "react";

/**
 * Debounce syncing a draft string into the URL (e.g. support ticket search `q`).
 * Reduces churn on `useSearchParams` and API calls.
 */
export function useDebouncedUrlParam(
  urlValue: string,
  setSearchParams: (cb: (prev: URLSearchParams) => URLSearchParams, opts?: { replace?: boolean }) => void,
  options: { param: string; delayMs?: number; resetPageParam?: string }
) {
  const { param, delayMs = 400, resetPageParam = "page" } = options;
  const [draft, setDraft] = useState(urlValue);

  useEffect(() => {
    setDraft(urlValue);
  }, [urlValue]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (draft === urlValue) return;
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          const trimmed = draft.trim();
          if (trimmed) n.set(param, trimmed);
          else n.delete(param);
          n.set(resetPageParam, "1");
          return n;
        },
        { replace: true }
      );
    }, delayMs);
    return () => clearTimeout(t);
  }, [draft, urlValue, param, delayMs, resetPageParam, setSearchParams]);

  return [draft, setDraft] as const;
}
