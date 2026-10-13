/** Append `in_app=1` (and optional params) for provider mobile HTTPS bridge URLs. */
export function appendInAppQuery(
  url: string,
  options?: { inApp?: boolean; extra?: Record<string, string> },
): string {
  if (!options?.inApp) return url;
  const params = new URLSearchParams();
  params.set("in_app", "1");
  if (options.extra) {
    for (const [k, v] of Object.entries(options.extra)) {
      if (v) params.set(k, v);
    }
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${params.toString()}`;
}
