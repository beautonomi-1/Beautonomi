import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest, NextResponse } from "next/server";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getPublicPageContent } from "@/lib/content/getPublicPageContent";
import { getPaymentFeatureFlagsForTenant } from "@/lib/subscriptions/entitlements";

/** CMS-managed template shape; `currency` is set per request from tenant region. */
type GiftCardTemplate = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  denominations: number[];
  category: string;
  is_active: boolean;
  custom_amount?: { min: number; max: number };
};

const DEFAULT_TEMPLATES: GiftCardTemplate[] = [
  {
    id: "gc-birthday",
    name: "Happy Birthday",
    description: "Celebrate a special birthday with a beauty treat",
    image_url: "/images/gift-cards/birthday.svg",
    denominations: [100, 250, 500, 1000],
    category: "birthday",
    is_active: true,
  },
  {
    id: "gc-thankyou",
    name: "Thank You",
    description: "Show your appreciation with a beauty gift card",
    image_url: "/images/gift-cards/thankyou.svg",
    denominations: [100, 250, 500, 1000],
    category: "appreciation",
    is_active: true,
  },
  {
    id: "gc-selfcare",
    name: "Self-Care Day",
    description: "Treat yourself or a loved one to a self-care experience",
    image_url: "/images/gift-cards/selfcare.svg",
    denominations: [150, 300, 500, 1000, 2000],
    category: "wellness",
    is_active: true,
  },
  {
    id: "gc-holiday",
    name: "Holiday Special",
    description: "The perfect holiday gift for beauty lovers",
    image_url: "/images/gift-cards/holiday.svg",
    denominations: [200, 500, 1000, 2500],
    category: "holiday",
    is_active: true,
  },
  {
    id: "gc-custom",
    name: "Custom Amount",
    description: "Choose any amount within the allowed range",
    image_url: "/images/gift-cards/custom.svg",
    denominations: [],
    category: "custom",
    is_active: true,
    custom_amount: { min: 50, max: 5000 },
  },
];

function toPositiveMoneyList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
}

function toCustomAmount(value: unknown): GiftCardTemplate["custom_amount"] {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const min = Number(raw.min);
  const max = Number(raw.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return undefined;
  return { min, max };
}

function normalizeCmsTemplate(value: unknown, index: number): GiftCardTemplate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = String(raw.id || raw.template_id || `cms-gift-card-${index + 1}`).trim();
  const name = String(raw.name || raw.title || raw.alt || `Gift card ${index + 1}`).trim();
  const imageUrl = String(raw.image_url || raw.src || "").trim();
  if (!id || !name || !imageUrl) return null;

  return {
    id,
    name,
    description: String(raw.description || raw.subtitle || "").trim(),
    image_url: imageUrl,
    denominations: toPositiveMoneyList(raw.denominations),
    category: String(raw.category || "cms").trim() || "cms",
    is_active: raw.is_active === false ? false : true,
    custom_amount: toCustomAmount(raw.custom_amount),
  };
}

async function getCmsTemplates(): Promise<GiftCardTemplate[] | null> {
  const content = await getPublicPageContent("gift-card");
  const rawDesigns = content?.designs_list?.content;
  if (!rawDesigns) return null;

  try {
    const parsed = JSON.parse(rawDesigns);
    if (!Array.isArray(parsed)) return null;
    const templates = parsed
      .map((item, index) => normalizeCmsTemplate(item, index))
      .filter((item): item is GiftCardTemplate => Boolean(item && item.is_active));
    return templates.length > 0 ? templates : null;
  } catch (error) {
    console.error("Failed to parse gift-card designs_list from CMS:", error);
    return null;
  }
}

/**
 * GET /api/public/gift-cards/marketplace
 *
 * Returns CMS-managed gift card templates (designs + denomination options).
 * Falls back to bundled defaults when `gift-card.designs_list` is empty.
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

    // Gate the catalog by the same `gift_cards` flag the purchase route uses
    // so disabling gift cards consistently hides designs/denominations across
    // the funnel (marketing page → purchase form → checkout). Without this
    // gate, the purchase page still loaded design cards while the submit
    // action returned 403 — confusing for buyers.
    const flags = await getPaymentFeatureFlagsForTenant(tenantId);
    if (!flags.gift_cards) {
      return errorResponse("Gift cards are currently unavailable.", "FEATURE_DISABLED", 403);
    }

    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const cmsTemplates = await getCmsTemplates();
    const sourceTemplates = cmsTemplates ?? DEFAULT_TEMPLATES;
    const filteredTemplates = category
      ? sourceTemplates.filter((t) => t.category === category)
      : sourceTemplates;
    const templates = filteredTemplates.map((t) => ({ ...t, currency: lastResortCurrency }));

    return successResponse({
      templates,
      total: templates.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch gift card templates");
  }
}
