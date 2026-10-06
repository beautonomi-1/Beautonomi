/**
 * HTTPS redirect URLs for Paystack hosted checkout and Stripe Checkout Session.
 * Paystack ignores non-HTTPS callback_url; mobile auth sessions require returnUrl
 * prefix to match the gateway redirect.
 */

const APP_SCHEME_PREFIXES = ["customer://", "exp://", "provider://"] as const;

export function isAppSchemeUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") return false;
  const t = url.trim();
  return APP_SCHEME_PREFIXES.some((p) => t.startsWith(p));
}

/** True when client sent a native app return target (scheme URL). */
export function normalizeInAppHint(clientCallback?: string | null): boolean {
  return isAppSchemeUrl(clientCallback);
}

/** Scheme URL or HTTPS bridge URL with `context=app`. */
export function clientHintsInApp(clientCallback?: string | null): boolean {
  if (!clientCallback || typeof clientCallback !== "string") return false;
  const t = clientCallback.trim();
  if (normalizeInAppHint(t)) return true;
  try {
    return new URL(t).searchParams.get("context") === "app";
  } catch {
    return false;
  }
}

function trimSlash(base: string): string {
  return base.replace(/\/$/, "");
}

function appendQueryParams(
  basePathOrUrl: string,
  query: Record<string, string | undefined | null>,
  inApp: boolean,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v != null && String(v).trim() !== "") params.set(k, String(v).trim());
  }
  if (inApp) params.set("context", "app");
  const qs = params.toString();
  if (!qs) return basePathOrUrl;
  const sep = basePathOrUrl.includes("?") ? "&" : "?";
  return `${basePathOrUrl}${sep}${qs}`;
}

export type HostedCheckoutCallbackParams = {
  baseUrl: string;
  successPath: string;
  cancelPath: string;
  query?: Record<string, string | undefined | null>;
  inApp?: boolean;
};

export type HostedCheckoutCallbackResult = {
  successUrl: string;
  cancelUrl: string;
  inApp: boolean;
};

/**
 * Build absolute HTTPS success/cancel URLs for hosted checkout redirects.
 * Allows http://localhost in development via baseUrl.
 */
export function buildHostedCheckoutCallbackUrls(
  params: HostedCheckoutCallbackParams,
): HostedCheckoutCallbackResult {
  const base = trimSlash(params.baseUrl.trim() || "https://beautonomi.com");
  const inApp = params.inApp === true;
  const successPath = params.successPath.startsWith("/")
    ? params.successPath
    : `/${params.successPath}`;
  const cancelPath = params.cancelPath.startsWith("/")
    ? params.cancelPath
    : `/${params.cancelPath}`;

  let successUrl = `${base}${successPath}`;
  let cancelUrl = `${base}${cancelPath}`;

  if (params.query && Object.keys(params.query).length > 0) {
    successUrl = appendQueryParams(successUrl, params.query, inApp);
    cancelUrl = appendQueryParams(cancelUrl, params.query, inApp);
  } else if (inApp) {
    successUrl = appendQueryParams(successUrl, {}, true);
    cancelUrl = appendQueryParams(cancelUrl, {}, true);
  }

  return { successUrl, cancelUrl, inApp };
}

/**
 * Resolve Paystack/Stripe redirect URLs from an optional client callback hint.
 * Scheme URLs are never forwarded to the gateway — only used for inApp + bridge paths.
 */
export function resolveHostedCheckoutCallbacks(options: {
  baseUrl: string;
  clientCallbackUrl?: string | null;
  defaultSuccessPath: string;
  defaultCancelPath: string;
  query?: Record<string, string | undefined | null>;
  /** When true, append context=app even if client did not send a scheme URL. */
  forceInApp?: boolean;
}): HostedCheckoutCallbackResult {
  const client = options.clientCallbackUrl?.trim() ?? "";
  const inApp = options.forceInApp === true || clientHintsInApp(client);

  if (client && !isAppSchemeUrl(client) && /^https?:\/\//i.test(client)) {
    const base = trimSlash(options.baseUrl);
    const cancelFromClient =
      client.includes("cancelled=1") || client.includes("payment_cancelled")
        ? client
        : undefined;
    return {
      successUrl: client,
      cancelUrl:
        cancelFromClient ??
        buildHostedCheckoutCallbackUrls({
          baseUrl: base,
          successPath: options.defaultCancelPath,
          cancelPath: options.defaultCancelPath,
          query: options.query,
          inApp,
        }).cancelUrl,
      inApp,
    };
  }

  return buildHostedCheckoutCallbackUrls({
    baseUrl: options.baseUrl,
    successPath: options.defaultSuccessPath,
    cancelPath: options.defaultCancelPath,
    query: options.query,
    inApp,
  });
}

export function resolveSaveCardForInitialize(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return false;
  if (metadata.save_card === true || metadata.save_card === "true") return true;
  if (metadata.saveCard === true || metadata.saveCard === "true") return true;
  return false;
}

/** Paystack-only: include channels key only when save-card flow requires card tender. */
export function paystackChannelsForInitialize(options: { saveCard: boolean }): { channels?: string[] } {
  if (options.saveCard) return { channels: ["card"] };
  return {};
}
