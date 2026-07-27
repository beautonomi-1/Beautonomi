import { getBackendUrl, APP_URL } from "@/config/public-env";

const PAYSTACK_HOST_ALLOWLIST = new Set([
  "checkout.paystack.com",
  "standard.paystack.co",
  "paystack.shop",
  "api.paystack.co",
]);

const STRIPE_HOST_ALLOWLIST = new Set(["checkout.stripe.com", "pay.stripe.com"]);

const DEV_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "10.0.2.2"]);

function hostnameFromConfiguredUrl(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  try {
    return new URL(raw.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function collectConfiguredHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [APP_URL, getBackendUrl()]) {
    const host = hostnameFromConfiguredUrl(raw);
    if (host) hosts.add(host);
  }
  return hosts;
}

function isPaystackHost(host: string): boolean {
  return (
    PAYSTACK_HOST_ALLOWLIST.has(host) ||
    host.endsWith(".paystack.com") ||
    host.endsWith(".paystack.co") ||
    host.endsWith(".paystack.shop")
  );
}

function isStripeHost(host: string): boolean {
  return STRIPE_HOST_ALLOWLIST.has(host) || host.endsWith(".stripe.com");
}

/** Whether a URL may load inside the provider in-app WebView. */
export function isAllowedInAppWebViewUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("provider://")) return true;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (DEV_HOST_ALLOWLIST.has(host)) return true;

  const configured = collectConfiguredHosts();
  if (configured.has(host)) return true;
  for (const base of configured) {
    if (host === base || host.endsWith(`.${base}`)) return true;
  }

  return isPaystackHost(host) || isStripeHost(host);
}

export function getWebViewOriginWhitelist(): string[] {
  const patterns = new Set<string>([
    "provider://*",
    "https://*",
    "http://localhost:*",
    "http://127.0.0.1:*",
    "http://10.0.2.2:*",
  ]);

  for (const host of collectConfiguredHosts()) {
    patterns.add(`https://${host}/*`);
    patterns.add(`http://${host}/*`);
  }

  for (const host of PAYSTACK_HOST_ALLOWLIST) {
    patterns.add(`https://${host}/*`);
  }
  patterns.add("https://*.paystack.com/*");
  patterns.add("https://*.paystack.co/*");
  patterns.add("https://*.paystack.shop/*");
  patterns.add("https://*.stripe.com/*");

  return [...patterns];
}

/** Returns false when the URL must open externally instead of the in-app WebView. */
export function validateInAppBrowserUrl(url: string): boolean {
  return isAllowedInAppWebViewUrl(url);
}
