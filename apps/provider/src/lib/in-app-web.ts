import type { Href, Router } from "expo-router";
import * as Linking from "expo-linking";
import { isAllowedInAppWebViewUrl } from "@/lib/webview-allowlist";

/** Route registered in `app/(app)/(tabs)/more/in-app-browser.tsx`. */
export const IN_APP_BROWSER_PATH = "/(app)/(tabs)/more/in-app-browser" as const;

/**
 * Navigate to the in-app WebView screen (http/https). Prefer this over
 * `Linking.openURL` / `WebBrowser.openBrowserAsync` so users stay inside the app.
 * Non-allowlisted URLs should be opened with Linking instead.
 */
export function hrefInAppBrowser(url: string, title: string): Href {
  return {
    pathname: IN_APP_BROWSER_PATH,
    params: {
      url: encodeURIComponent(url),
      title: encodeURIComponent(title),
    },
  } as Href;
}

export function pushInAppBrowser(router: Router, url: string, title: string): void {
  if (!isAllowedInAppWebViewUrl(url)) {
    Linking.openURL(url).catch(() => {});
    return;
  }
  router.push(hrefInAppBrowser(url, title) as never);
}

export function replaceInAppBrowser(router: Router, url: string, title: string): void {
  if (!isAllowedInAppWebViewUrl(url)) {
    Linking.openURL(url).catch(() => {});
    return;
  }
  router.replace(hrefInAppBrowser(url, title) as never);
}
