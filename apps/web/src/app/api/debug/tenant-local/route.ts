import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Localhost-only tenant/env diagnostics (non-secret). Not available in production. */
// eslint-disable-next-line perf/require-auth-on-route -- localhost + non-production gate; no secrets in response
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const host = (request.headers.get("host") || "").split(":")[0]?.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceRole =
    serviceKey && serviceKey.includes(".")
      ? (() => {
          try {
            const payload = JSON.parse(
              Buffer.from(serviceKey.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
                "utf8",
              ),
            ) as { role?: string; ref?: string };
            return { role: payload.role ?? null, ref: payload.ref ?? null };
          } catch {
            return { role: null, ref: null };
          }
        })()
      : { role: null, ref: null };

  let zaTenantId: string | null = null;
  let queryError: string | null = null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("tenants").select("id").eq("slug", "za").maybeSingle();
    zaTenantId = data?.id ?? null;
    queryError = error?.message ?? null;
  } catch (e) {
    queryError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    dev_default_tenant_slug: process.env.DEV_DEFAULT_TENANT_SLUG?.trim() || null,
    node_env: process.env.NODE_ENV ?? null,
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    service_key_present: Boolean(serviceKey?.trim()),
    service_key_length: serviceKey?.length ?? 0,
    service_jwt: serviceRole,
    za_tenant_id: zaTenantId,
    query_error: queryError,
  });
}
