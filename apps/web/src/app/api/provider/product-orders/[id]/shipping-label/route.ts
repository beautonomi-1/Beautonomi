import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  BobGoLabelNotReadyError,
  getShippingProvider,
  type ShippingProviderId,
} from "@beautonomi/shipping";
import { isKnownShippingProviderId } from "@/lib/orders/shipping";
import { resolveProviderOwnedCredentials } from "@/lib/orders/shipping-runtime";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("view_sales", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: order } = await (supabase.from("product_orders") as any)
      .select(
        "id, provider_id, carrier, courier_shipment_id, tracking_number, courier_label_url, tracking_url, shipping_booking_status",
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!order) return notFoundResponse("Order not found");

    const carrier = (order as { carrier?: string | null }).carrier;
    const isBobGo = carrier === "bob-go";
    const bookingStatus = (order as { shipping_booking_status?: string | null }).shipping_booking_status;

    if (isBobGo && bookingStatus === "submitting") {
      return errorResponse("Waybill is not ready yet. Bob Go is still confirming the shipment.", "LABEL_NOT_READY", 409);
    }

    if (!isBobGo) {
      const storedUrl =
        (order as { courier_label_url?: string | null }).courier_label_url ??
        (order as { tracking_url?: string | null }).tracking_url;
      if (storedUrl) {
        return Response.redirect(storedUrl, 302);
      }
    }
    if (!isKnownShippingProviderId(carrier)) {
      return errorResponse("No label available for manual shipments", "NO_LABEL", 404);
    }

    const creds = await resolveProviderOwnedCredentials(getSupabaseAdmin(), providerId, carrier);
    if (!creds) {
      return errorResponse("Courier credentials not configured", "NOT_CONFIGURED", 400);
    }

    try {
      const label = await getShippingProvider(carrier as ShippingProviderId, creds).fetchLabel({
        shipmentId: (order as { courier_shipment_id?: string | null }).courier_shipment_id,
        trackingNumber: (order as { tracking_number?: string | null }).tracking_number,
      });
      if (label.url) {
        return Response.redirect(label.url, 302);
      }
      if (label.pdfBytes) {
        return new Response(Buffer.from(label.pdfBytes), {
          headers: {
            "Content-Type": label.contentType ?? "application/pdf",
            "Content-Disposition": `inline; filename="label-${id}.pdf"`,
          },
        });
      }
    } catch (err) {
      if (err instanceof BobGoLabelNotReadyError) {
        return errorResponse(err.message, "LABEL_NOT_READY", 409);
      }
      return errorResponse(
        err instanceof Error ? err.message : "Failed to fetch label",
        "LABEL_ERROR",
        502,
      );
    }

    return errorResponse("Label not available", "NO_LABEL", 404);
  } catch (err) {
    return handleApiError(err, "Failed to fetch shipping label");
  }
}
