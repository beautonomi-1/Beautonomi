import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/finance/vat-reports/check-reminders
 * 
 * Lightweight on-demand check for VAT reminders (runs when VAT reports page loads)
 * This is a simple check that doesn't send notifications automatically
 * Providers see reminders in the UI and can act on them
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return successResponse({ hasReminders: false });
    }

    // Check if provider is VAT-registered
    const { data: provider } = await supabase
      .from("providers")
      .select("is_vat_registered")
      .eq("id", providerId)
      .single();

    if (!provider?.is_vat_registered) {
      return successResponse({ hasReminders: false });
    }

    // Simple check: Are there any upcoming deadlines within 14 days?
    const now = new Date();
    const _fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Get current period
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let periodEnd: Date;
    let deadlineDate: Date;
    
    if (currentMonth % 2 === 0) {
      periodEnd = new Date(currentYear, currentMonth + 1, 0);
      deadlineDate = new Date(currentYear, currentMonth + 2, 25);
    } else {
      periodEnd = new Date(currentYear, currentMonth, 0);
      deadlineDate = new Date(currentYear, currentMonth + 1, 25);
    }

    // Check if deadline is within 14 days and VAT has been collected
    const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDeadline <= 14 && daysUntilDeadline > 0) {
      // Check if VAT was collected in this period
      const { data: vatTransactions } = await supabase
        .from('finance_transactions')
        .select('id')
        .eq('provider_id', providerId)
        .eq('transaction_type', 'tax')
        .gte('created_at', new Date(currentYear, currentMonth - (currentMonth % 2), 1).toISOString())
        .lte('created_at', periodEnd.toISOString())
        .limit(1);

      if (vatTransactions && vatTransactions.length > 0) {
        // Check if already remitted
        const { data: reminder } = await supabase
          .from("vat_remittance_reminders")
          .select("remitted_to_sars")
          .eq("provider_id", providerId)
          .eq("period_start", new Date(currentYear, currentMonth - (currentMonth % 2), 1).toISOString().split('T')[0])
          .eq("period_end", periodEnd.toISOString().split('T')[0])
          .maybeSingle();

        if (!reminder?.remitted_to_sars) {
          return successResponse({ 
            hasReminders: true,
            daysUntilDeadline,
            deadlineDate: deadlineDate.toISOString().split('T')[0],
          });
        }
      }
    }

    return successResponse({ hasReminders: false });
  } catch {
    // Silently fail - this is a background check
    return successResponse({ hasReminders: false });
  }
}
