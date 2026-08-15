import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

const lineSchema = z.object({
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  region: z.string().optional(),
  currency: z.string().optional(),
  reported_proceeds: z.number().optional(),
  expected_proceeds: z.number().optional(),
  bank_deposit: z.number().nullable().optional(),
  fx_rate: z.number().nullable().optional(),
  status: z.enum(["pending", "reviewed", "resolved", "disputed"]).optional(),
  statement_reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  apple_transaction_id: z.string().nullable().optional(),
  product_id: z.string().nullable().optional(),
  transaction_type: z.string().nullable().optional(),
  gross_amount: z.number().optional(),
  commission_amount: z.number().optional(),
  proceeds_amount: z.number().optional(),
});

const postSchema = z.object({
  rows: z.array(lineSchema).min(1),
});

function parseCsvRows(csv: string): Record<string, string>[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

function csvRowToLine(row: Record<string, string>) {
  const num = (key: string) => {
    const v = row[key];
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    period_start: row.period_start || row["Period Start"] || row.start_date || "",
    period_end: row.period_end || row["Period End"] || row.end_date || "",
    region: row.region || row.Region || "ZA",
    currency: row.currency || row.Currency || "ZAR",
    reported_proceeds: num("reported_proceeds") ?? num("Reported Proceeds"),
    expected_proceeds: num("expected_proceeds") ?? num("Expected Proceeds"),
    bank_deposit: num("bank_deposit") ?? num("Bank Deposit") ?? null,
    fx_rate: num("fx_rate") ?? num("FX Rate") ?? null,
    status: (row.status || row.Status || "pending") as "pending" | "reviewed" | "resolved" | "disputed",
    statement_reference: row.statement_reference || row["Statement Reference"] || null,
    notes: row.notes || row.Notes || null,
    apple_transaction_id: row.apple_transaction_id || row["Apple Transaction ID"] || row.transaction_id || null,
    product_id: row.product_id || row["Product ID"] || null,
    transaction_type: row.transaction_type || row["Transaction Type"] || null,
    gross_amount: num("gross_amount") ?? num("Gross Amount"),
    commission_amount: num("commission_amount") ?? num("Commission Amount"),
    proceeds_amount: num("proceeds_amount") ?? num("Proceeds Amount"),
  };
}

/** GET /api/admin/monetization/apple/settlements */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("apple_settlements")
      .select("*")
      .order("period_start", { ascending: false });

    if (error) throw error;

    const settlementIds = (data ?? []).map((s) => (s as { id: string }).id);
    let lineCounts: Record<string, number> = {};
    if (settlementIds.length > 0) {
      const { data: lines } = await supabase
        .from("apple_settlement_lines")
        .select("settlement_id")
        .in("settlement_id", settlementIds);
      for (const line of lines ?? []) {
        const sid = String((line as { settlement_id: string }).settlement_id);
        lineCounts[sid] = (lineCounts[sid] ?? 0) + 1;
      }
    }

    const items = (data ?? []).map((s) => {
      const row = s as Record<string, unknown>;
      return {
        ...row,
        line_count: lineCounts[String(row.id)] ?? 0,
      };
    });

    return successResponse({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/admin/monetization/apple/settlements — import CSV or JSON rows */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const contentType = request.headers.get("content-type") ?? "";
    let parsedRows: z.infer<typeof lineSchema>[] = [];

    if (contentType.includes("text/csv") || contentType.includes("text/plain")) {
      const csv = await request.text();
      const csvRows = parseCsvRows(csv);
      parsedRows = csvRows.map(csvRowToLine);
    } else {
      const body = await request.json();
      if (typeof body.csv === "string") {
        parsedRows = parseCsvRows(body.csv).map(csvRowToLine);
      } else {
        const validated = postSchema.safeParse(body);
        if (!validated.success) {
          return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validated.error.flatten());
        }
        parsedRows = validated.data.rows;
      }
    }

    const validated = z.array(lineSchema).safeParse(parsedRows);
    if (!validated.success || validated.data.length === 0) {
      return errorResponse("No valid rows to import", "VALIDATION_ERROR", 400, validated.error?.flatten());
    }

    const supabase = getSupabaseAdmin();
    const settlementCache = new Map<string, string>();
    let settlementsUpserted = 0;
    let linesInserted = 0;

    for (const row of validated.data) {
      if (!row.period_start || !row.period_end) continue;

      const cacheKey = `${row.period_start}|${row.period_end}|${row.region ?? "ZA"}|${row.currency ?? "ZAR"}`;
      let settlementId = settlementCache.get(cacheKey);

      if (!settlementId) {
        const payload = {
          period_start: row.period_start,
          period_end: row.period_end,
          region: row.region ?? "ZA",
          currency: row.currency ?? "ZAR",
          reported_proceeds: row.reported_proceeds ?? 0,
          expected_proceeds: row.expected_proceeds ?? 0,
          bank_deposit: row.bank_deposit ?? null,
          fx_rate: row.fx_rate ?? null,
          status: row.status ?? "pending",
          statement_reference: row.statement_reference ?? null,
          notes: row.notes ?? null,
          imported_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: user.id,
        };

        const { data: upserted, error: upsertErr } = await supabase
          .from("apple_settlements")
          .upsert(payload, { onConflict: "period_start,period_end,region,currency" })
          .select("id")
          .single();

        if (upsertErr) throw upsertErr;
        settlementId = String((upserted as { id: string }).id);
        settlementCache.set(cacheKey, settlementId);
        settlementsUpserted += 1;
      }

      const hasLine =
        row.apple_transaction_id ||
        row.product_id ||
        row.gross_amount != null ||
        row.proceeds_amount != null;

      if (hasLine) {
        const { error: lineErr } = await supabase.from("apple_settlement_lines").insert({
          settlement_id: settlementId,
          apple_transaction_id: row.apple_transaction_id ?? null,
          product_id: row.product_id ?? null,
          transaction_type: row.transaction_type ?? null,
          gross_amount: row.gross_amount ?? 0,
          commission_amount: row.commission_amount ?? 0,
          proceeds_amount: row.proceeds_amount ?? 0,
        });
        if (lineErr) throw lineErr;
        linesInserted += 1;
      }
    }

    await writeAuditLog({
      actor_user_id: user.id,
      action: "admin.monetization.apple.settlements.imported",
      entity_type: "apple_settlements",
      after_json: { settlements_upserted: settlementsUpserted, lines_inserted: linesInserted },
    });

    return successResponse({
      ok: true,
      settlements_upserted: settlementsUpserted,
      lines_inserted: linesInserted,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
