/**
 * Deterministic Yoco webhook event id (F-06).
 * Prefer the Standard Webhooks `webhook-id` header; otherwise the JSON `id`.
 * Never invent a random or shared fallback — an unkeyed event is rejected.
 */
export function yocoWebhookDedupeId(
  webhookId: string | null | undefined,
  event: Record<string, unknown> | null | undefined,
): string | null {
  const header = typeof webhookId === "string" ? webhookId.trim() : "";
  if (header) return header;
  if (event == null) return null;
  if (event.id != null && String(event.id).trim()) return String(event.id).trim();
  return null;
}
