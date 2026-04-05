import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

const DEFAULT_COPY = {
  title: "Keeping your account secure",
  body: "We regularly review accounts to make sure they're as secure as possible. We'll also let you know if there's more we can do to increase the security of your account.",
  safety_tips_customer: { label: "Safety tips for customers", url: "/help#customer" },
  safety_tips_provider: { label: "Safety tips for providers", url: "/help#provider" },
};

export type AccountSecurityCopy = typeof DEFAULT_COPY;

/**
 * GET /api/public/account-security-copy
 * Returns the "Keeping your account secure" sidebar copy (managed by superadmin).
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
    const copy = settings?.account_security_copy;
    const merged = copy && typeof copy === "object"
      ? {
          title: copy.title ?? DEFAULT_COPY.title,
          body: copy.body ?? DEFAULT_COPY.body,
          safety_tips_customer:
            copy.safety_tips_customer && typeof copy.safety_tips_customer === "object"
              ? {
                  label: copy.safety_tips_customer.label ?? DEFAULT_COPY.safety_tips_customer.label,
                  url: copy.safety_tips_customer.url ?? DEFAULT_COPY.safety_tips_customer.url,
                }
              : DEFAULT_COPY.safety_tips_customer,
          safety_tips_provider:
            copy.safety_tips_provider && typeof copy.safety_tips_provider === "object"
              ? {
                  label: copy.safety_tips_provider.label ?? DEFAULT_COPY.safety_tips_provider.label,
                  url: copy.safety_tips_provider.url ?? DEFAULT_COPY.safety_tips_provider.url,
                }
              : DEFAULT_COPY.safety_tips_provider,
        }
      : DEFAULT_COPY;

    return NextResponse.json({ data: merged, error: null });
  } catch (e) {
    console.error("account-security-copy:", e);
    return NextResponse.json({ data: DEFAULT_COPY, error: null }, { status: 200 });
  }
}
