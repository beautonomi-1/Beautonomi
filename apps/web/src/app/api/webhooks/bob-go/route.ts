import { createHmac, timingSafeEqual } from "crypto";
import { after, NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchBobGoShipment } from "@beautonomi/shipping";
import {
  applyBobGoShipmentSnapshotToOrder,
  findProductOrderIdByBobGoTracking,
} from "@/lib/orders/bob-go-shipment-sync";
import {
  decryptBobGoWebhookSecret,
  findProviderIdByBobGoTrackingReference,
} from "@/lib/orders/bob-go-webhook-auth";
import { resolveProviderOwnedCredentials } from "@/lib/orders/shipping-runtime";

export const maxDuration = 60;

function verifyBobGoSignature(rawBody: string, secret: string, header: string | null): boolean {
  if (!header?.trim()) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(header.trim());
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function trackingRefFromPayload(topic: string, payload: Record<string, unknown>): string | null {
  if (topic === "tracking/updated") {
    return (
      (typeof payload.shipment_tracking_reference === "string" && payload.shipment_tracking_reference) ||
      (typeof payload.tracking_reference === "string" && payload.tracking_reference) ||
      null
    );
  }
  return (
    (typeof payload.tracking_reference === "string" && payload.tracking_reference) ||
    (typeof payload.shipment_tracking_reference === "string" && payload.shipment_tracking_reference) ||
    null
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const topic = request.headers.get("X-BobGroup-Topic") ?? request.headers.get("x-bobgroup-topic") ?? "";
  const trackingRef = trackingRefFromPayload(topic, payload);
  if (!trackingRef) {
    return new Response("ok", { status: 200 });
  }

  const admin = getSupabaseAdmin();
  const providerId = await findProviderIdByBobGoTrackingReference(admin, trackingRef);
  const orderId = (await findProductOrderIdByBobGoTracking(admin, trackingRef)) ?? null;

  if (!orderId) {
    return new Response("ok", { status: 200 });
  }

  const secret = providerId ? await decryptBobGoWebhookSecret(admin, providerId) : null;
  if (!secret) {
    return new Response("ok", { status: 200 });
  }

  const sig = request.headers.get("bobgo-webhook-signature");
  if (!verifyBobGoSignature(rawBody, secret, sig)) {
    return new Response("Invalid signature", { status: 401 });
  }

  after(async () => {
    try {
      if (!providerId) return;
      const { data: orderRow } = await (admin.from("product_orders") as any)
        .select("courier_shipment_id, tracking_number")
        .eq("id", orderId)
        .maybeSingle();
      const creds = await resolveProviderOwnedCredentials(admin, providerId, "bob-go");
      const bobCreds = creds?.["bob-go"];
      const snapshot =
        bobCreds != null
          ? await fetchBobGoShipment(bobCreds, {
              trackingReference:
                (orderRow as { tracking_number?: string | null } | null)?.tracking_number ?? trackingRef,
              shipmentId: (orderRow as { courier_shipment_id?: string | null } | null)?.courier_shipment_id,
            })
          : null;
      if (!snapshot) return;
      await applyBobGoShipmentSnapshotToOrder(admin, orderId, snapshot, {
        trackingPayload: topic === "tracking/updated" ? payload : undefined,
      });
    } catch (err) {
      console.error("[bob-go/webhook] apply failed", err);
    }
  });

  return new Response("ok", { status: 200 });
}
