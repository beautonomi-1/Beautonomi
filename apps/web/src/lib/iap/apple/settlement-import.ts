/**
 * Import Apple Financial Report rows into apple_settlements + apple_settlement_lines
 * and enqueue reconciliation_exceptions when ledger proceeds diverge.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getFxRate } from "@/lib/fx/get-fx-rate";
import { recordReconciliationException } from "@/lib/reconciliation/three-way-engine";

export type AppleFinancialReportRow = {
  startDate: string | null;
  endDate: string | null;
  appleTransactionId: string | null;
  productId: string | null;
  transactionType: string | null;
  quantity: number;
  customerPrice: number;
  customerCurrency: string;
  partnerShare: number;
  extendedPartnerShare: number;
  partnerShareCurrency: string;
  saleOrReturn: string | null;
  countryOfSale: string | null;
  raw: Record<string, string>;
};

export type ParseAppleFinancialReportResult = {
  rows: AppleFinancialReportRow[];
  periodStart: string | null;
  periodEnd: string | null;
  currency: string | null;
};

export type ImportAppleSettlementInput = {
  supabase: SupabaseClient;
  reportText: string;
  region?: string;
  tenantId: string;
  bankDeposit?: number | null;
  statementReference?: string | null;
  createdBy?: string | null;
  varianceTolerance?: number;
};

export type ImportAppleSettlementResult = {
  settlementId: string;
  lineCount: number;
  reportedProceeds: number;
  expectedProceeds: number;
  variance: number;
  fxRate: number | null;
  exceptionRecorded: boolean;
  periodStart: string;
  periodEnd: string;
  currency: string;
};

const HEADER_ALIASES: Record<keyof Omit<AppleFinancialReportRow, "raw">, string[]> = {
  startDate: ["start date", "begin date"],
  endDate: ["end date", "finish date"],
  appleTransactionId: ["apple identifier", "transaction id", "apple transaction id"],
  productId: ["vendor identifier", "sku", "product id", "product identifier"],
  transactionType: ["product type identifier", "product type", "transaction type"],
  quantity: ["quantity", "units"],
  customerPrice: ["customer price", "customer price (per unit)"],
  customerCurrency: ["customer currency", "currency of sale"],
  partnerShare: ["partner share", "developer proceeds"],
  extendedPartnerShare: ["extended partner share", "developer proceeds (total)"],
  partnerShareCurrency: ["partner share currency", "currency of proceeds"],
  saleOrReturn: ["sales or return", "sale or return"],
  countryOfSale: ["country of sale", "country code"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function splitReportLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function detectDelimiter(headerLine: string): "\t" | "," {
  const tabCount = (headerLine.match(/\t/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  return tabCount >= commaCount ? "\t" : ",";
}

function parseDelimitedLine(line: string, delimiter: "\t" | ","): string[] {
  if (delimiter === "\t") {
    return line.split("\t").map((cell) => cell.trim());
  }
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseMoney(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function parseQuantity(value: string | undefined): number {
  const n = Number(String(value ?? "1").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : 1;
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, mm, dd, yyyy] = slash;
    return `${yyyy}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

function buildHeaderMap(headers: string[]): Partial<Record<keyof Omit<AppleFinancialReportRow, "raw">, number>> {
  const map: Partial<Record<keyof Omit<AppleFinancialReportRow, "raw">, number>> = {};
  (Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>).forEach((field) => {
    const idx = findHeaderIndex(headers, HEADER_ALIASES[field]);
    if (idx >= 0) map[field] = idx;
  });
  return map;
}

function cellAt(cells: string[], index: number | undefined): string {
  if (index == null || index < 0) return "";
  return cells[index] ?? "";
}

export function parseAppleFinancialReport(reportText: string): ParseAppleFinancialReportResult {
  const lines = splitReportLines(reportText);
  const headerIndex = lines.findIndex(
    (line) =>
      /start date/i.test(line) &&
      (/partner share/i.test(line) || /developer proceeds/i.test(line) || /extended partner share/i.test(line)),
  );
  if (headerIndex < 0) {
    throw new Error("Apple financial report is missing a recognizable header row");
  }

  const delimiter = detectDelimiter(lines[headerIndex]!);
  const headers = parseDelimitedLine(lines[headerIndex]!, delimiter);
  const headerMap = buildHeaderMap(headers);
  const rows: AppleFinancialReportRow[] = [];
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let currency: string | null = null;

  for (const line of lines.slice(headerIndex + 1)) {
    if (/^total/i.test(line)) break;
    const cells = parseDelimitedLine(line, delimiter);
    if (cells.every((cell) => !cell)) continue;

    const raw: Record<string, string> = {};
    headers.forEach((header, idx) => {
      raw[header] = cells[idx] ?? "";
    });

    const startDate = toIsoDate(cellAt(cells, headerMap.startDate));
    const endDate = toIsoDate(cellAt(cells, headerMap.endDate));
    const partnerShareCurrency =
      cellAt(cells, headerMap.partnerShareCurrency).toUpperCase() ||
      cellAt(cells, headerMap.customerCurrency).toUpperCase() ||
      "ZAR";
    const quantity = parseQuantity(cellAt(cells, headerMap.quantity));
    const customerPrice = parseMoney(cellAt(cells, headerMap.customerPrice));
    const partnerShare = parseMoney(cellAt(cells, headerMap.partnerShare));
    const extendedPartnerShare = parseMoney(cellAt(cells, headerMap.extendedPartnerShare));
    const proceeds =
      extendedPartnerShare !== 0
        ? extendedPartnerShare
        : Math.round(partnerShare * quantity * 100) / 100;

    if (proceeds === 0 && customerPrice === 0) continue;

    periodStart = periodStart ?? startDate;
    periodEnd = endDate ?? periodEnd;
    currency = partnerShareCurrency || currency;

    rows.push({
      startDate,
      endDate,
      appleTransactionId: cellAt(cells, headerMap.appleTransactionId) || null,
      productId: cellAt(cells, headerMap.productId) || null,
      transactionType: cellAt(cells, headerMap.transactionType) || null,
      quantity,
      customerPrice,
      customerCurrency: cellAt(cells, headerMap.customerCurrency).toUpperCase() || partnerShareCurrency,
      partnerShare,
      extendedPartnerShare: proceeds,
      partnerShareCurrency,
      saleOrReturn: cellAt(cells, headerMap.saleOrReturn) || null,
      countryOfSale: cellAt(cells, headerMap.countryOfSale) || null,
      raw,
    });
  }

  if (rows.length === 0) {
    throw new Error("Apple financial report contained no transaction rows");
  }

  return {
    rows,
    periodStart: periodStart ?? rows[0]?.startDate ?? null,
    periodEnd: periodEnd ?? rows[rows.length - 1]?.endDate ?? null,
    currency: currency ?? rows[0]?.partnerShareCurrency ?? "ZAR",
  };
}

async function resolveExpectedProceeds(params: {
  supabase: SupabaseClient;
  periodStart: string;
  periodEnd: string;
  currency: string;
  fxRate: number | null;
}): Promise<number> {
  const { supabase, periodStart, periodEnd, currency, fxRate } = params;
  const startIso = `${periodStart}T00:00:00.000Z`;
  const endIso = `${periodEnd}T23:59:59.999Z`;

  const { data } = await supabase
    .from("finance_transactions")
    .select("net, metadata, created_at")
    .in("transaction_type", ["provider_subscription_payment", "provider_ads_payment"])
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  let total = 0;
  for (const row of (data ?? []) as Array<{ net?: number | string | null; metadata?: Record<string, unknown> | null }>) {
    const provider = String(row.metadata?.payment_provider ?? "").toLowerCase();
    if (provider !== "apple") continue;
    const net = Number(row.net ?? 0);
    if (!Number.isFinite(net)) continue;
    total += net;
  }

  if (currency !== "ZAR" && fxRate != null) {
    return Math.round(total * fxRate * 100) / 100;
  }
  return Math.round(total * 100) / 100;
}

async function linkFinanceTransactionId(
  supabase: SupabaseClient,
  appleTransactionId: string | null,
): Promise<string | null> {
  if (!appleTransactionId) return null;
  const { data } = await supabase
    .from("finance_transactions")
    .select("id")
    .contains("metadata", { reference: appleTransactionId })
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export async function importAppleSettlement(
  input: ImportAppleSettlementInput,
): Promise<ImportAppleSettlementResult> {
  const {
    supabase,
    reportText,
    region = "ZA",
    tenantId,
    bankDeposit = null,
    statementReference = null,
    createdBy = null,
    varianceTolerance = 0.05,
  } = input;

  const parsed = parseAppleFinancialReport(reportText);
  const periodStart = parsed.periodStart;
  const periodEnd = parsed.periodEnd;
  const currency = parsed.currency ?? "ZAR";
  if (!periodStart || !periodEnd) {
    throw new Error("Could not determine settlement period from the Apple financial report");
  }

  const fxRate =
    currency === "ZAR"
      ? 1
      : await getFxRate({ base: "ZAR", quote: currency, at: new Date(`${periodEnd}T12:00:00.000Z`) });

  const reportedProceeds = Math.round(
    parsed.rows.reduce((sum, row) => {
      const sign = row.saleOrReturn && /return/i.test(row.saleOrReturn) ? -1 : 1;
      return sum + sign * row.extendedPartnerShare;
    }, 0) * 100,
  ) / 100;

  const expectedProceeds = await resolveExpectedProceeds({
    supabase,
    periodStart,
    periodEnd,
    currency,
    fxRate,
  });

  const variance = Math.round((reportedProceeds - expectedProceeds) * 100) / 100;
  const nowIso = new Date().toISOString();

  const { data: settlementRow, error: settlementError } = await supabase
    .from("apple_settlements")
    .upsert(
      {
        period_start: periodStart,
        period_end: periodEnd,
        region,
        currency,
        reported_proceeds: reportedProceeds,
        expected_proceeds: expectedProceeds,
        bank_deposit: bankDeposit,
        fx_rate: fxRate,
        status: Math.abs(variance) <= varianceTolerance ? "reviewed" : "pending",
        statement_reference: statementReference,
        notes: null,
        imported_at: nowIso,
        updated_at: nowIso,
        created_by: createdBy,
      },
      { onConflict: "period_start,period_end,region,currency" },
    )
    .select("id, variance")
    .single();

  if (settlementError || !settlementRow) {
    throw new Error(settlementError?.message ?? "Failed to upsert apple_settlements");
  }

  const settlementId = (settlementRow as { id: string }).id;

  await supabase.from("apple_settlement_lines").delete().eq("settlement_id", settlementId);

  const lineRows = await Promise.all(
    parsed.rows.map(async (row) => {
      const sign = row.saleOrReturn && /return/i.test(row.saleOrReturn) ? -1 : 1;
      const gross = Math.round(row.customerPrice * row.quantity * sign * 100) / 100;
      const proceeds = Math.round(row.extendedPartnerShare * sign * 100) / 100;
      const commission = Math.round((gross - proceeds) * 100) / 100;
      return {
        settlement_id: settlementId,
        apple_transaction_id: row.appleTransactionId,
        product_id: row.productId,
        transaction_type: row.transactionType,
        gross_amount: gross,
        commission_amount: commission,
        proceeds_amount: proceeds,
        finance_transaction_id: await linkFinanceTransactionId(supabase, row.appleTransactionId),
        metadata: {
          quantity: row.quantity,
          customer_currency: row.customerCurrency,
          partner_share_currency: row.partnerShareCurrency,
          country_of_sale: row.countryOfSale,
          sale_or_return: row.saleOrReturn,
          raw: row.raw,
        },
      };
    }),
  );

  const { error: lineError } = await supabase.from("apple_settlement_lines").insert(lineRows);
  if (lineError) {
    throw new Error(lineError.message);
  }

  let exceptionRecorded = false;
  if (Math.abs(variance) > varianceTolerance) {
    await recordReconciliationException(supabase, {
      tenantId,
      currency,
      psp: "apple",
      ledgerAmount: expectedProceeds,
      pspAmount: reportedProceeds,
      bankAmount: bankDeposit ?? undefined,
      ledgerId: settlementId,
      pspExternalId: statementReference ?? `${periodStart}_${periodEnd}`,
      toleranceMinorUnits: varianceTolerance,
      reason: "apple_settlement_variance",
      source: "psp",
    });
    exceptionRecorded = true;
  }

  return {
    settlementId,
    lineCount: lineRows.length,
    reportedProceeds,
    expectedProceeds,
    variance,
    fxRate,
    exceptionRecorded,
    periodStart,
    periodEnd,
    currency,
  };
}
