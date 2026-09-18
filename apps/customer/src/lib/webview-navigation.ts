import { isAllowedInAppWebViewUrl } from "@/lib/webview-allowlist";

const BLOCKED_IN_APP_TOOLBAR_HOSTS = new Set(["vercel.live", "va.vercel-scripts.com"]);

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isBlockedToolbarHost(host: string): boolean {
  if (BLOCKED_IN_APP_TOOLBAR_HOSTS.has(host)) return true;
  return host.endsWith(".vercel.live");
}

/**
 * URLs that should open in the system browser (unknown https).
 * Returns false for in-app allowlisted hosts and for Vercel Live toolbar hosts
 * (those stay in the WebView but navigation is cancelled — no Safari bounce).
 */
export function shouldOpenInSystemBrowser(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("customer://")) return false;
  const host = hostnameFromUrl(url);
  if (!host) return false;
  if (isBlockedToolbarHost(host)) return false;
  return !isAllowedInAppWebViewUrl(url);
}

export function shouldCancelInAppNavigation(url: string): boolean {
  const host = hostnameFromUrl(url);
  if (!host) return false;
  return isBlockedToolbarHost(host);
}

/** Injected after load to hide Vercel Live preview iframes inside legal pages. */
export const HIDE_VERCEL_LIVE_IFRAMES_JS = `
(function() {
  function hide() {
    document.querySelectorAll('iframe[src*="vercel.live"]').forEach(function(el) {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    });
  }
  hide();
  new MutationObserver(hide).observe(document.documentElement, { childList: true, subtree: true });
})();
true;
`;
