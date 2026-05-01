import { NextRequest } from "next/server";
import { endOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse } from "@/lib/supabase/api-helpers";
import { dateRangeBoundsUtc, formatDateYmd, resolveTz } from "@/lib/dates/provider-tz";

type BiPeriod = { period_start: string; period_end: string; deadline_date: string };

function buildBiMonthlyPeriods(year: number, tz: string): BiPeriod[] {
  const periods: BiPeriod[] = [];
  for (let month = 0; month < 12; month += 2) {
    const period_start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const secondMonthYmd = `${year}-${String(month + 2).padStart(2, "0")}-01`;
    const zSecond = toZonedTime(new Date(`${secondMonthYmd}T12:00:00.000Z`), tz);
    const period_end = formatDateYmd(endOfMonth(zSecond), tz);

    let deadlineMonth = month + 3;
    let deadlineYear = year;
    if (deadlineMonth > 12) {
      deadlineMonth -= 12;
      deadlineYear += 1;
    }
    const deadline_date = `${deadlineYear}-${String(deadlineMonth).padStart(2, "0")}-25`;

    periods.push({ period_start, period_end, deadline_date });
  }
  return periods;
}

/**
 * GET /api/provider/finance/vat-reports/check-reminders
 *
 * Lightweight on-demand check for VAT reminders (runs when VAT reports page loads)
 * This is a simple check that doesn't send notifications automatically
 * Providers see reminders in the UI and can act on them
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return successResponse({ hasReminders: false });
    }

    const { data: provider } = await supabase
      .from("providers")
      .select("is_vat_registered, timezone")
      .eq("id", providerId)
      .single();

    if (!provider?.is_vat_registered) {
      return successResponse({ hasReminders: false });
    }

    const tz = resolveTz((provider as { timezone?: string | null }).timezone);
    const now = new Date();
    const todayYmd = formatDateYmd(now, tz);
    const year = parseInt(todayYmd.slice(0, 4), 10);

    const periods = buildBiMonthlyPeriods(year, tz);
    const current = periods.find((p) => todayYmd >= p.period_start && todayYmd <= p.period_end);
    if (!current) {
      return successResponse({ hasReminders: false });
    }

    const deadlineDate = new Date(`${current.deadline_date}T12:00:00.000Z`);
    const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDeadline <= 14 && daysUntilDeadline > 0) {
      const { fromIso, toIso } = dateRangeBoundsUtc(current.period_start, current.period_end, tz);

      const { data: vatTransactions } = await supabase
        .from("finance_transactions")
        .select("id")
        .eq("provider_id", providerId)
        .eq("transaction_type", "tax")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .limit(1);

      if (vatTransactions && vatTransactions.length > 0) {
        const { data: reminder } = await supabase
          .from("vat_remittance_reminders")
          .select("remitted_to_sars")
          .eq("provider_id", providerId)
          .eq("period_start", current.period_start)
          .eq("period_end", current.period_end)
          .maybeSingle();

        if (!reminder?.remitted_to_sars) {
          return successResponse({
            hasReminders: true,
            daysUntilDeadline,
            deadlineDate: current.deadline_date,
          });
        }
      }
    }

    return successResponse({ hasReminders: false });
  } catch {
    return successResponse({ hasReminders: false });
  }
}
