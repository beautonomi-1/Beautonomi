import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

/** Fallback templates when `gift_card_templates` is missing; `currency` is set per request from tenant region. */
type GiftCardTemplateFallback = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  denominations: number[];
  category: string;
  is_active: boolean;
  custom_amount?: { min: number; max: number };
};

const DEFAULT_TEMPLATES: GiftCardTemplateFallback[] = [
  {
    id: "gc-birthday",
    name: "Happy Birthday",
    description: "Celebrate a special birthday with a beauty treat",
    image_url: "/images/gift-cards/birthday.png",
    denominations: [100, 250, 500, 1000],
    category: "birthday",
    is_active: true,
  },
  {
    id: "gc-thankyou",
    name: "Thank You",
    description: "Show your appreciation with a beauty gift card",
    image_url: "/images/gift-cards/thankyou.png",
    denominations: [100, 250, 500, 1000],
    category: "appreciation",
    is_active: true,
  },
  {
    id: "gc-selfcare",
    name: "Self-Care Day",
    description: "Treat yourself or a loved one to a self-care experience",
    image_url: "/images/gift-cards/selfcare.png",
    denominations: [150, 300, 500, 1000, 2000],
    category: "wellness",
    is_active: true,
  },
  {
    id: "gc-holiday",
    name: "Holiday Special",
    description: "The perfect holiday gift for beauty lovers",
    image_url: "/images/gift-cards/holiday.png",
    denominations: [200, 500, 1000, 2500],
    category: "holiday",
    is_active: true,
  },
  {
    id: "gc-custom",
    name: "Custom Amount",
    description: "Choose any amount within the allowed range",
    image_url: "/images/gift-cards/custom.png",
    denominations: [],
    category: "custom",
    is_active: true,
    custom_amount: { min: 50, max: 5000 },
  },
];

/**
 * GET /api/public/gift-cards/marketplace
 *
 * Returns available gift card templates (designs + denomination options).
 * Tries the `gift_card_templates` table first; falls back to hardcoded
 * templates when the table doesn't exist.
 *
 * Query params:
 *   - category  (optional) — filter by template category
 */
export async function GET(request: NextRequest) {
  try {
    let tenantId: string;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch (tenantErr) {
      console.error("Tenant resolution failed in /api/public/gift-cards/marketplace:", tenantErr);
      return NextResponse.json(
        {
          data: null,
          error: { message: "Tenant not configured", code: "TENANT_UNAVAILABLE" },
        },
        { status: 503 }
      );
    }
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    let templates: any[] | null = null;

    try {
      const supabaseAdmin = await getSupabaseAdmin();
      let query = supabaseAdmin
        .from("gift_card_templates")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (category) {
        query = query.eq("category", category);
      }

      const { data, error } = await query;

      if (!error && data && data.length > 0) {
        templates = data.map((t: Record<string, unknown>) => ({
          ...t,
          currency: (t.currency as string) || lastResortCurrency,
        }));
      }
    } catch {
      // Table doesn't exist — use defaults
    }

    // Fallback to hardcoded templates
    if (!templates) {
      const base = category
        ? DEFAULT_TEMPLATES.filter((t) => t.category === category)
        : DEFAULT_TEMPLATES;
      templates = base.map((t) => ({ ...t, currency: lastResortCurrency }));
    }

    return successResponse({
      templates,
      total: templates.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch gift card templates");
  }
}
