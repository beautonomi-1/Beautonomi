import type { SecurityApi, SecurityApiResult } from "@beautonomi/auth-security";
import { FetchError, fetcher } from "@/lib/http/fetcher";

function unwrap<T>(json: unknown): T | null {
  if (json && typeof json === "object" && "data" in (json as Record<string, unknown>)) {
    return ((json as { data?: T }).data ?? null) as T | null;
  }
  return (json ?? null) as T | null;
}

async function run<T>(fn: () => Promise<unknown>): Promise<SecurityApiResult<T>> {
  try {
    return { data: unwrap<T>(await fn()), error: null };
  } catch (e) {
    if (e instanceof FetchError) {
      return { data: null, error: { message: e.message, code: e.code, details: e.details } };
    }
    return {
      data: null,
      error: { message: e instanceof Error ? e.message : "Request failed", code: "NETWORK_ERROR" },
    };
  }
}

/** Web adapter for @beautonomi/auth-security client flows (never cached). */
export const webSecurityApi: SecurityApi = {
  get: <T,>(path: string) => run<T>(() => fetcher.get(path, { staleTimeMs: 0 })),
  post: <T,>(path: string, body?: Record<string, unknown>) => run<T>(() => fetcher.post(path, body ?? {})),
  delete: <T,>(path: string) => run<T>(() => fetcher.delete(path)),
};
