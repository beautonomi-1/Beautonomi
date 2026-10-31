import type { BearerCourierCredentials } from "@beautonomi/shipping";

const BOB_GO_WEBHOOK_TOPICS = [
  "shipment_submission_status/updated",
  "tracking/updated",
  "shipment_charged_amount/updated",
  "shipment_charged_weight/updated",
] as const;

export function resolveBobGoWebhookDeliveryUrl(): string | null {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  const base =
    fromEnv ||
    (process.env.VERCEL_URL?.trim()
      ? `https://${process.env.VERCEL_URL.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")}`
      : "");
  if (!base.startsWith("https://")) return null;
  return `${base}/api/webhooks/bob-go`;
}

type BobGoWebhookRow = {
  id: number;
  topic: string;
  delivery_url: string;
  status: string;
};

export async function ensureBobGoWebhookSubscriptions(
  credentials: BearerCourierCredentials,
): Promise<{ ok: boolean; error?: string }> {
  const deliveryUrl = resolveBobGoWebhookDeliveryUrl();
  if (!deliveryUrl) {
    return { ok: false, error: "NEXT_PUBLIC_APP_URL must be https for Bob Go webhooks" };
  }

  const baseUrl = (credentials.baseUrl?.trim() || "https://api.bobgo.co.za/v2").replace(/\/+$/, "");
  const apiKey = credentials.apiKey.trim();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  let existing: BobGoWebhookRow[] = [];
  try {
    const listRes = await fetch(`${baseUrl}/webhooks`, { method: "GET", headers });
    if (listRes.ok) {
      const parsed = (await listRes.json()) as unknown;
      existing = Array.isArray(parsed) ? (parsed as BobGoWebhookRow[]) : [];
    }
  } catch {
    existing = [];
  }

  const missing = BOB_GO_WEBHOOK_TOPICS.filter(
    (topic) =>
      !existing.some((row) => row.topic === topic && row.delivery_url === deliveryUrl && row.status === "active"),
  );
  if (missing.length === 0) return { ok: true };

  const body = {
    webhook_subscriptions: missing.map((topic) => ({
      topic,
      delivery_url: deliveryUrl,
      status: "active",
    })),
  };

  try {
    const res = await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text.slice(0, 300) || `Bob Go webhooks HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
