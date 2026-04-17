import { NextRequest, NextResponse } from "next/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TEMPLATE_HEADERS = [
  "name",
  "email",
  "phone",
  "location",
  "category",
  "description",
  "source",
  "notes",
  "tags",
];

const EXAMPLE_ROWS = [
  [
    "Glow Beauty Salon",
    "thandi@glowsalon.co.za",
    "+27 71 123 4567",
    "Sandton, Johannesburg",
    "Hair; Nails",
    "Referred by existing provider",
    "referral",
    "Follow up next week",
    "vip; sandton",
  ],
  [
    "Sipho Barbershop",
    "",
    "0821234567",
    "Cape Town",
    "Hair",
    "",
    "",
    "",
    "",
  ],
  [
    "Lerato Mokoena",
    "lerato@email.com",
    "",
    "",
    "",
    "Met at trade show",
    "outbound",
    "",
    "",
  ],
];

const INSTRUCTIONS = [
  "# Provider Leads Import Template",
  "#",
  "# ALL COLUMNS ARE OPTIONAL. Put whatever data you have.",
  "# The system auto-detects and normalizes everything it can.",
  "#",
  "# Column guide:",
  "#   name        - Business name, person name, or both (auto-detected)",
  "#   email       - Email address (auto-normalized)",
  "#   phone       - Any phone format: +27711234567, 0821234567, 27-71-123-4567 (auto-normalized to E.164)",
  "#   location    - Free-text: city, address, area, suburb, or full address (geocoded automatically)",
  "#   category    - Service categories separated by semicolons, e.g. Hair; Nails (matched to platform categories)",
  "#   description - Any context about the lead",
  "#   source      - How you found them: manual, import, referral, campaign, outbound, api, form (default: import)",
  "#   notes       - Internal admin notes",
  '#   tags        - Labels separated by commas, e.g. "vip, sandton, urgent"',
  "#",
  "# Tips:",
  "#   - You can rename columns however you like (Name, Business, Contact, Phone Number, etc.)",
  "#   - Rows with no data are skipped automatically",
  "#   - Lines starting with # are ignored",
  "#   - No row limit — import as many leads as you need",
  "#   - The system never rejects a row; partial data is imported with whatever is available",
  "#",
  "# EXAMPLE ROWS (delete or overwrite before importing):",
];

function escapeField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * GET /api/admin/provider-ops/leads/template
 * Download a CSV import template. ?format=with-categories appends category reference.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);

    const { searchParams } = new URL(request.url);
    const includeCats = searchParams.get("format") === "with-categories";

    const lines: string[] = [...INSTRUCTIONS];
    lines.push(TEMPLATE_HEADERS.map(escapeField).join(","));
    for (const row of EXAMPLE_ROWS) {
      lines.push(row.map(escapeField).join(","));
    }

    if (includeCats) {
      const supabase = getSupabaseAdmin();
      const { data: cats } = await supabase
        .from("global_service_categories")
        .select("name, slug")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (cats && cats.length > 0) {
        lines.push("");
        lines.push("# ── Available Categories (for reference) ──");
        for (const c of cats) {
          lines.push(`#   ${c.name}`);
        }
      }
    }

    const csv = lines.join("\n") + "\n";

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="provider-leads-import-template.csv"`,
      },
    });
  } catch {
    return NextResponse.json(
      { data: null, error: { message: "Failed to generate template", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
