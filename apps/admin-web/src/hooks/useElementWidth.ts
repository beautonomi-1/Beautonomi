import { useCallback, useLayoutEffect, useState } from "react";

/**
 * Live width of an element. Returns a callback ref so it also works for elements
 * that mount after loading states. Width is 0 until measured.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: T | null) => setNode(el), []);

  useLayoutEffect(() => {
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number") setWidth(w);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return [ref, width];
}
