import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * Hardcoded gift card templates used as a fallback when the
 * `gift_card_templates` table doesn't exist yet.
 */
const DEFAULT_TEMPLATES = [
  {
    id: "gc-birthday",
    name: "Happy Birthday",
    description: "Celebrate a special birthday with a beauty treat",
    image_url: "/images/gift-cards/birthday.png",
    denominations: [100, 250, 500, 1000],
    currency: "ZAR",
    category: "birthday",
    is_active: true,
  },
  {
    id: "gc-thankyou",
    name: "Thank You",
    description: "Show your appreciation with a beauty gift card",
    image_url: "/images/gift-cards/thankyou.png",
    denominations: [100, 250, 500, 1000],
    currency: "ZAR",
    category: "appreciation",
    is_active: true,
  },
  {
    id: "gc-selfcare",
    name: "Self-Care Day",
    description: "Treat yourself or a loved one to a self-care experience",
    image_url: "/images/gift-cards/selfcare.png",
    denominations: [150, 300, 500, 1000, 2000],
    currency: "ZAR",
    category: "wellness",
    is_active: true,
  },
  {
    id: "gc-holiday",
    name: "Holiday Special",
    description: "The perfect holiday gift for beauty lovers",
    image_url: "/images/gift-cards/holiday.png",
    denominations: [200, 500, 1000, 2500],
    currency: "ZAR",
    category: "holiday",
    is_active: true,
  },
  {
    id: "gc-custom",
    name: "Custom Amount",
    description: "Choose any amount — from R50 to R5,000",
    image_url: "/images/gift-cards/custom.png",
    denominations: [],
    currency: "ZAR",
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
        templates = data;
      }
    } catch {
      // Table doesn't exist — use defaults
    }

    // Fallback to hardcoded templates
    if (!templates) {
      templates = category
        ? DEFAULT_TEMPLATES.filter((t) => t.category === category)
        : DEFAULT_TEMPLATES;
    }

    return successResponse({
      templates,
      total: templates.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch gift card templates");
  }
}
