import { headers } from "next/headers";
import { resolveTenantIdWithZaFallback } from "./resolve-tenant-from-db";

/**
 * Resolve the tenant ID from the incoming server component request headers.
 * Creates a synthetic Request from `next/headers` so the existing resolver can be reused.
 */
export async function resolveTenantIdFromServerHeaders(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost";
  const syntheticRequest = new Request("http://localhost", {
    headers: { "x-forwarded-host": host, host },
  });
  return resolveTenantIdWithZaFallback(syntheticRequest);
}
