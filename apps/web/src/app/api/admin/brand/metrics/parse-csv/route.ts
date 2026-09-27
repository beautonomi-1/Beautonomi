import { NextRequest } from "next/server";
import { z } from "zod";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";

const bodySchema = z.object({
  csv: z.string().min(1),
  placement_id: z.string().uuid(),
});

function parseCsvLines(csv: string): Array<Record<string, string>> {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { csv, placement_id } = bodySchema.parse(await request.json());
    const parsed = parseCsvLines(csv).map((row) => ({
      placement_id,
      as_of: row.date || row.as_of || "",
      spend: row.spend ? Number(row.spend) : undefined,
      impressions: row.impressions ? Number(row.impressions) : undefined,
      clicks: row.clicks ? Number(row.clicks) : undefined,
    }));

    return successResponse({ preview: parsed, count: parsed.length });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to parse CSV");
  }
}
