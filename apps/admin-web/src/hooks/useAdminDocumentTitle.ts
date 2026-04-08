import { useEffect } from "react";

const TITLE_SUFFIX = "Beautonomi Admin";

/**
 * Sets `document.title` for the active admin view (browser tab).
 * Does not restore the previous title on unmount so the next route can replace it cleanly.
 */
export function useAdminDocumentTitle(pageTitle: string) {
  useEffect(() => {
    const t = pageTitle.trim();
    document.title = t ? `${t} · ${TITLE_SUFFIX}` : TITLE_SUFFIX;
  }, [pageTitle]);
}
