import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateProviderSlotAgainstGrid,
  type EvaluateProviderSlotAgainstGridInput,
} from "@/lib/provider-booking/compute-provider-slot-grid";
import {
  PUBLIC_BOOKING_MAX_ADVANCE_DAYS,
  PUBLIC_BOOKING_MIN_NOTICE_MINUTES,
} from "@/lib/provider-booking/public-booking-slot-policy";

export type AssertPublicSlotBookableInput = Omit<
  EvaluateProviderSlotAgainstGridInput,
  "minNoticeMinutes" | "maxAdvanceDays"
>;

/**
 * Provider-portal parity: verify a public customer slot against the shared
 * availability grid with min-notice=0 and max-advance=365.
 */
export async function assertPublicSlotBookable(
  supabase: SupabaseClient,
  input: AssertPublicSlotBookableInput,
): Promise<{ ok: boolean; conflicts: string[]; providerTimeZone: string | null }> {
  return evaluateProviderSlotAgainstGrid(supabase, {
    ...input,
    minNoticeMinutes: PUBLIC_BOOKING_MIN_NOTICE_MINUTES,
    maxAdvanceDays: PUBLIC_BOOKING_MAX_ADVANCE_DAYS,
  });
}
