"use client";

import { useLayoutEffect, useState } from "react";

/** Tailwind default `md` breakpoint (keep in sync with `tailwind.config`). */
export const TW_MD_MIN_QUERY = "(min-width: 768px)";

/**
 * `null` until the client has evaluated the query (SSR + first render).
 * After mount, updates on `change` so resize/orientation swaps stay correct.
 */
export function useMediaQueryMatch(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
