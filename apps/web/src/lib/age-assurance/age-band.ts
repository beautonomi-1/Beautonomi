import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgeBand, AgeBandSource, ResolvedAgeBand } from "./types";

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const monthDiff = today.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsed.getDate())) {
    age -= 1;
  }
  return age;
}

export function bandFromAge(age: number | null): AgeBand {
  if (age == null || !Number.isFinite(age)) return "unknown";
  if (age < 13) return "under_13";
  if (age < 18) return "13_17";
  return "18_plus";
}

export function bandFromDeviceLowerBound(lowerBound: number | null | undefined): AgeBand {
  if (lowerBound == null || !Number.isFinite(lowerBound)) return "unknown";
  if (lowerBound < 13) return "under_13";
  if (lowerBound < 18) return "13_17";
  return "18_plus";
}

export function bandFromDeviceUpperBound(upperBound: number | null | undefined): AgeBand {
  if (upperBound == null || !Number.isFinite(upperBound)) return "unknown";
  if (upperBound < 13) return "under_13";
  if (upperBound < 18) return "13_17";
  return "18_plus";
}

type UserAgeRow = {
  date_of_birth: string | null;
  legal_date_of_birth: string | null;
  under_age_flag: boolean | null;
  device_age_lower_bound: number | null;
  device_age_upper_bound: number | null;
};

/**
 * Resolve age band with strict precedence:
 * under_age_flag → verified KYC DOB → declared DOB → device signal → unknown
 */
export async function resolveAgeBand(
  userId: string,
  supabase: SupabaseClient,
): Promise<ResolvedAgeBand> {
  const { data, error } = await supabase
    .from("users")
    .select("date_of_birth, legal_date_of_birth, under_age_flag, device_age_lower_bound, device_age_upper_bound")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  const row = data as UserAgeRow | null;
  if (!row) {
    return { band: "unknown", source: "none" };
  }

  if (row.under_age_flag === true) {
    return { band: "under_13", source: "under_age_flag" };
  }

  const verifiedAge = ageFromDob(row.legal_date_of_birth);
  if (verifiedAge != null) {
    return { band: bandFromAge(verifiedAge), source: "verified_dob" };
  }

  const declaredAge = ageFromDob(row.date_of_birth);
  if (declaredAge != null) {
    return { band: bandFromAge(declaredAge), source: "declared_dob" };
  }

  if (row.device_age_lower_bound != null) {
    return {
      band: bandFromDeviceLowerBound(row.device_age_lower_bound),
      source: "device_signal",
    };
  }

  if (row.device_age_upper_bound != null) {
    return {
      band: bandFromDeviceUpperBound(row.device_age_upper_bound),
      source: "device_signal",
    };
  }

  return { band: "unknown", source: "none" };
}
