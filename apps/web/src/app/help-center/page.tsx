import { redirect } from "next/navigation";

/**
 * Help centre URL: forwards to `/help`, or deep-links known `topic` values to submit ticket with a category.
 */
export default async function HelpCentrePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const topicRaw = sp.topic;
  const topic = typeof topicRaw === "string" ? topicRaw : Array.isArray(topicRaw) ? topicRaw[0] : undefined;
  if (topic === "feedback") {
    redirect("/help/submit-ticket?category=feedback_feature");
  }
  if (topic === "data-export-feedback") {
    redirect("/help/submit-ticket?category=account_privacy_data");
  }

  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "topic") continue;
    if (typeof v === "string") q.set(k, v);
    else if (Array.isArray(v) && v[0]) q.set(k, v[0]);
  }
  const s = q.toString();
  redirect(s ? `/help?${s}` : "/help");
}
