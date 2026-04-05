import "server-only";

import { headers } from "next/headers";

/**
 * Synthetic Request carrying Host / forwarded headers for tenant resolution (sitemap, etc.).
 */
export async function buildSeoRequestFromHeaders(): Promise<Request> {
  const h = await headers();
  const hostHeader = (h.get("x-forwarded-host") || h.get("host") || "").trim();
  const proto = h.get("x-forwarded-proto") === "http" ? "http" : "https";
  const hostOnly = hostHeader.split(":")[0] || "localhost";
  const url = `${proto}://${hostOnly}/`;
  const hdr = new Headers();
  hdr.set("host", hostOnly);
  if (hostHeader) hdr.set("x-forwarded-host", hostHeader);
  hdr.set("x-forwarded-proto", proto);
  return new Request(url, { headers: hdr });
}
