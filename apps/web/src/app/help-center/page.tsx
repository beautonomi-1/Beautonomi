import { redirect } from "next/navigation";

/**
 * Help centre URL: forwards to `/help` and preserves query params (e.g. `?topic=feedback`).
 */
export default async function HelpCentrePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") q.set(k, v);
    else if (Array.isArray(v) && v[0]) q.set(k, v[0]);
  }
  const s = q.toString();
  redirect(s ? `/help?${s}` : "/help");
}
