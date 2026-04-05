import { FetchError } from "@/lib/http/fetcher";

export function formatFetchError(e: unknown, fallback: string): string {
  if (!(e instanceof FetchError)) return e instanceof Error ? e.message : fallback;
  const msg = e.message;
  if (!e.details) return msg;
  const details = Array.isArray(e.details)
    ? (e.details as Array<{ path?: string; message?: string }>)
        .map((d) => (d.path ? `${d.path}: ${d.message ?? ""}` : String(d.message ?? d)))
        .join("; ")
    : String(e.details);
  return details ? `${msg}: ${details}` : msg;
}
