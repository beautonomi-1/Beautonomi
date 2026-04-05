import { NextResponse } from "next/server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

export type PublicTenantResult = { tenantId: string };

/**
 * Host → tenant for public /api routes. Returns 503 JSON if resolution fails (aligned with search/home).
 */
export async function requirePublicTenant(request: Request): Promise<PublicTenantResult | NextResponse> {
  try {
    const tenantId = await resolveTenantIdWithZaFallback(request);
    return { tenantId };
  } catch {
    return NextResponse.json(
      {
        data: null,
        error: { message: "Tenant not configured", code: "TENANT_UNAVAILABLE" },
      },
      { status: 503 }
    );
  }
}
