/**

 * GET /api/cron/fx-reference-rates

 * Fetch daily Frankfurter rates into fx_reference_rates (reporting only).

 */

import { NextRequest, NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron-auth";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { fetchFrankfurterRate } from "@/lib/fx/frankfurter-reference-rate";



export async function GET(request: NextRequest) {

  const auth = verifyCronRequest(request);

  if (!auth.valid) {

    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });

  }



  const pairs: Array<[string, string]> = [

    ["EUR", "ZAR"],

    ["GBP", "ZAR"],

    ["USD", "ZAR"],

  ];



  const supabase = getSupabaseAdmin();

  const results: unknown[] = [];



  for (const [base, quote] of pairs) {

    const rate = await fetchFrankfurterRate(base, quote);

    if (!rate) continue;

    const { error } = await supabase.from("fx_reference_rates").upsert(

      {

        rate_date: rate.rateDate,

        base_currency: rate.baseCurrency,

        quote_currency: rate.quoteCurrency,

        rate: rate.rate,

        source: rate.source,

        fetched_at: new Date().toISOString(),

      },

      { onConflict: "rate_date,base_currency,quote_currency,source" },

    );

    results.push({ pair: `${base}/${quote}`, ok: !error, error: error?.message });

  }



  return NextResponse.json({ ok: true, results });

}

