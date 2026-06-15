import type { OneSignalAppType } from "@/lib/platform/secrets";

/**
 * Relative path for in-app / email action links (never prefixed to https here).
 */
export function substituteTemplatePath(
  templatePath: string,
  variables: Record<string, string>,
): string {
  let result = templatePath;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

/**
 * Prefix a relative web path with NEXT_PUBLIC_APP_URL for web portal / email links.
 */
export function toWebPortalUrl(relativePath: string): string {
  if (!relativePath.startsWith("/")) return relativePath;
  const origin =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
      : "";
  return origin ? `${origin}${relativePath}` : relativePath;
}

/**
 * Strip origin from an absolute URL, returning pathname + search.
 */
export function webUrlToRelativePath(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return url;
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

export type PushUrlFields = {
  /** Top-level OneSignal `url` — omitted for native app pushes (in-app routing uses `data`). */
  launchUrl?: string;
  /** Relative path stored on in-app rows and in push `data`. */
  actionPath: string;
  /** Web portal URL for email bodies when needed. */
  webUrl: string;
};

/**
 * Resolve push URL fields. Native mobile pushes (customer/provider app) must NOT
 * set OneSignal launch URL to https — Android opens the browser before JS runs.
 */
export function resolvePushUrlFields(
  relativeTemplatePath: string,
  variables: Record<string, string>,
  options?: { appType?: OneSignalAppType | null },
): PushUrlFields {
  const actionPath = substituteTemplatePath(relativeTemplatePath, variables);
  const webUrl = actionPath.startsWith("/") ? toWebPortalUrl(actionPath) : actionPath;

  if (options?.appType === "customer" || options?.appType === "provider") {
    return { actionPath, webUrl };
  }

  return {
    launchUrl: webUrl,
    actionPath,
    webUrl,
  };
}

export function applyPushUrlToPayload(
  notificationPayload: Record<string, unknown>,
  fields: PushUrlFields,
): void {
  const data = (notificationPayload.data ?? {}) as Record<string, unknown>;
  if (fields.actionPath) {
    data.action_url = fields.actionPath;
    data.deep_link = fields.actionPath;
  }
  if (fields.launchUrl) {
    notificationPayload.url = fields.launchUrl;
    data.url = fields.launchUrl;
    data.deep_link = fields.launchUrl;
  }
  notificationPayload.data = data;
}
