import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

const DEFAULT_COPY = {
  title: "Make all payments through Beautonomi",
  body: "Always pay and communicate through Beautonomi to ensure you're protected under our Terms of Service, Payments Terms of Service, cancellation, and other safeguards.",
  learn_more_url: "/terms-and-condition",
  learn_more_label: "Learn more",
};

export type PaymentSafetyCopy = typeof DEFAULT_COPY;

/**
 * GET /api/public/payment-safety-copy
 * Returns the payment safety sidebar copy (managed by superadmin).
 */
export async function GET(request: Request) {
  try {
    const supabase = await getSupabaseServer();
    const tenant = await resolveTenantFromRequest(request);
    const tenantId = tenant?.id ?? "";
    let tenantRow: { settings?: unknown } | null = null;
    if (tenantId) {
      const { data } = await supabase
        .from("platform_settings")
        .select("settings")
        .eq("is_active", true)
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle();
      tenantRow = (data as { settings?: unknown } | null) ?? null;
    }
    const { data: globalRow } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .is("tenant_id", null)
      .limit(1)
      .maybeSingle();
    const row = tenantRow ?? globalRow;

    const settings = (row as any)?.settings;
    const copy = settings?.payment_safety_copy;
    const merged = copy && typeof copy === "object"
      ? {
          title: copy.title ?? DEFAULT_COPY.title,
          body: copy.body ?? DEFAULT_COPY.body,
          learn_more_url: copy.learn_more_url ?? DEFAULT_COPY.learn_more_url,
          learn_more_label: copy.learn_more_label ?? DEFAULT_COPY.learn_more_label,
        }
      : DEFAULT_COPY;

    return NextResponse.json({ data: merged, error: null });
  } catch (e) {
    console.error("payment-safety-copy:", e);
    return NextResponse.json({ data: DEFAULT_COPY, error: null }, { status: 200 });
  }
}
