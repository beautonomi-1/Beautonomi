import { useLayoutEffect, useRef, useState } from "react";

/**
 * Height from the shell's top edge to the bottom of the viewport (minus main padding-bottom).
 * Used by support ticket queue and detail so one viewport fits under breadcrumbs + sticky header.
 */
export function useAdminWorkspaceHeight(enabled: boolean): {
  shellRef: (el: HTMLDivElement | null) => void;
  heightPx: number | null;
} {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const lastHeightRef = useRef<number | null>(null);
  const [heightPx, setHeightPx] = useState<number | null>(null);

  const shellRef = (el: HTMLDivElement | null) => {
    nodeRef.current = el;
  };

  useLayoutEffect(() => {
    if (!enabled) {
      lastHeightRef.current = null;
      setHeightPx(null);
      return;
    }

    const measure = () => {
      const shell = nodeRef.current;
      if (!shell) return;
      const main = shell.closest("main");
      const mainPadBottom = main
        ? parseFloat(getComputedStyle(main).paddingBottom) || 0
        : 0;
      const top = shell.getBoundingClientRect().top;
      const next = Math.max(200, Math.round(window.innerHeight - top - mainPadBottom));
      if (lastHeightRef.current === next) return;
      lastHeightRef.current = next;
      setHeightPx(next);
    };

    measure();

    const roShell = new ResizeObserver(() => measure());
    if (nodeRef.current) roShell.observe(nodeRef.current);

    const header = document.querySelector("header.sticky");
    const roHeader = header ? new ResizeObserver(() => measure()) : null;
    if (header && roHeader) roHeader.observe(header);

    const breadcrumb = document.querySelector('nav[aria-label="Breadcrumb"]');
    const roCrumb = breadcrumb ? new ResizeObserver(() => measure()) : null;
    if (breadcrumb && roCrumb) roCrumb.observe(breadcrumb);

    window.addEventListener("resize", measure);
    return () => {
      roShell.disconnect();
      roHeader?.disconnect();
      roCrumb?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled]);

  return { shellRef, heightPx };
}
