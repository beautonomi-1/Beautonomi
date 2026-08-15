/**
 * Download App Store Connect financial reports and import them through the
 * existing settlement parser. This uses the Connect API (not StoreKit Server
 * API). It needs a vendor number plus a Connect API key with Finance access.
 */

import { createSign } from "crypto";
import { gunzipSync } from "zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadAppleConnectConfig,
  type AppleConnectConfig,
} from "@/lib/iap/apple/config";
import { importAppleSettlement } from "@/lib/iap/apple/settlement-import";

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

export function createAppStoreConnectJwt(config: AppleConnectConfig, ttlSeconds = 1200): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
  const payload = {
    iss: config.issuerId,
    iat: now,
    exp: now + ttlSeconds,
    aud: "appstoreconnect-v1",
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const sign = createSign("SHA256");
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign({ key: config.privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

function reportMonths(now: Date = new Date()): string[] {
  const months: string[] = [];
  for (let offset = 1; offset <= 3; offset += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

async function decodeReportBody(res: Response): Promise<string> {
  const buf = Buffer.from(await res.arrayBuffer());
  const encoding = (res.headers.get("content-encoding") ?? res.headers.get("content-type") ?? "").toLowerCase();
  if (encoding.includes("gzip") || encoding.includes("a-gzip") || buf[0] === 0x1f) {
    try {
      return gunzipSync(buf).toString("utf8");
    } catch {
      /* fall through to raw text */
    }
  }
  return buf.toString("utf8");
}

export async function fetchAppleFinanceReport(params: {
  config: AppleConnectConfig;
  reportDate: string;
  regionCode: string;
  reportType?: "FINANCIAL" | "FINANCE_DETAIL";
}): Promise<string> {
  const token = createAppStoreConnectJwt(params.config);
  const qs = new URLSearchParams({
    "filter[regionCode]": params.regionCode,
    "filter[reportDate]": params.reportDate,
    "filter[reportType]": params.reportType ?? "FINANCIAL",
    "filter[vendorNumber]": params.config.vendorNumber,
  });
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/financeReports?${qs}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/a-gzip",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`App Store Connect finance report ${res.status}: ${text.slice(0, 300)}`);
  }
  return decodeReportBody(res);
}

export async function syncAppleFinanceReports(params: {
  supabase: SupabaseClient;
  tenantId: string;
  createdBy?: string | null;
  now?: Date;
}): Promise<{
  imported: number;
  skipped: string[];
  errors: string[];
  vendorConfigured: boolean;
}> {
  const config = await loadAppleConnectConfig(params.supabase);
  if (!config) {
    return {
      imported: 0,
      skipped: ["App Store Connect finance credentials or vendor number are not configured"],
      errors: [],
      vendorConfigured: false,
    };
  }

  const skipped: string[] = [];
  const errors: string[] = [];
  let imported = 0;

  const jobs: Array<{ reportType: "FINANCIAL" | "FINANCE_DETAIL"; regionCode: string }> = [
    { reportType: "FINANCIAL", regionCode: config.regionCode || "ZZ" },
    { reportType: "FINANCE_DETAIL", regionCode: "Z1" },
  ];

  for (const job of jobs) {
    for (const reportDate of reportMonths(params.now)) {
      const [year, month] = reportDate.split("-").map(Number);
      const periodStart = `${reportDate}-01`;
      const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
      const periodEnd = `${reportDate}-${String(lastDay).padStart(2, "0")}`;

      const { data: existing } = await params.supabase
        .from("apple_settlements")
        .select("id")
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .eq("region", job.regionCode)
        .maybeSingle();
      if (existing?.id) {
        skipped.push(`${job.reportType} ${job.regionCode} ${reportDate} already imported`);
        continue;
      }

      try {
        const reportText = await fetchAppleFinanceReport({
          config,
          reportDate,
          regionCode: job.regionCode,
          reportType: job.reportType,
        });
        await importAppleSettlement({
          supabase: params.supabase,
          reportText,
          region: job.regionCode,
          tenantId: params.tenantId,
          createdBy: params.createdBy ?? null,
          statementReference: `ASC ${job.reportType} ${reportDate} ${job.regionCode}`,
        });
        imported += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          /\b404\b/.test(message) ||
          /\b400\b/.test(message) ||
          /not found/i.test(message) ||
          /no reports matching/i.test(message)
        ) {
          skipped.push(`${job.reportType} ${job.regionCode} ${reportDate} not published yet`);
        } else {
          errors.push(`${job.reportType} ${job.regionCode} ${reportDate}: ${message}`);
        }
      }
    }
  }

  return { imported, skipped, errors, vendorConfigured: true };
}
