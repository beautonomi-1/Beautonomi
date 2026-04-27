import type { SupabaseClient } from "@supabase/supabase-js";

type MfaAuth = {
  mfa?: {
    enroll?: (args: { factorType: "totp"; friendlyName?: string }) => Promise<{
      data: {
        id: string;
        type?: string;
        totp?: {
          qr_code?: string;
          secret?: string;
          uri?: string;
        };
      } | null;
      error: Error | null;
    }>;
    getAuthenticatorAssuranceLevel?: () => Promise<{
      data: { currentLevel: string; nextLevel: string | null } | null;
      error: Error | null;
    }>;
    listFactors?: () => Promise<{
      data: { totp: Array<{ id: string; status: string; friendly_name?: string | null }> } | null;
      error: Error | null;
    }>;
    challenge?: (args: { factorId: string }) => Promise<{
      data: { id: string; expires_at?: string } | null;
      error: Error | null;
    }>;
    verify?: (args: { factorId: string; challengeId: string; code: string }) => Promise<{
      error: Error | null;
    }>;
  };
};

function mfaApi(supabase: SupabaseClient): MfaAuth["mfa"] | undefined {
  return (supabase.auth as unknown as MfaAuth).mfa;
}

export type TotpFactor = {
  id: string;
  status: string;
  friendly_name?: string | null;
};

export type TotpEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

export type MfaAfterPasswordResult =
  | { kind: "ok" }
  | { kind: "totp"; factorId: string; challengeId: string }
  | { kind: "enrollment_required"; message: string };

export async function listVerifiedTotpFactors(supabase: SupabaseClient): Promise<TotpFactor[]> {
  const mfa = mfaApi(supabase);
  if (!mfa?.listFactors) return [];
  const { data, error } = await mfa.listFactors();
  if (error) throw error;
  return data?.totp?.filter((f) => f.status === "verified") ?? [];
}

export async function startTotpEnrollment(
  supabase: SupabaseClient,
  friendlyName = "Beautonomi Admin"
): Promise<{ data: TotpEnrollment | null; error: Error | null }> {
  const mfa = mfaApi(supabase);
  if (!mfa?.enroll) {
    return { data: null, error: new Error("Two-factor enrollment is not available in this client.") };
  }
  const { data, error } = await mfa.enroll({ factorType: "totp", friendlyName });
  if (error || !data?.id) return { data: null, error: error ?? new Error("Could not start MFA enrollment.") };
  return {
    data: {
      factorId: data.id,
      qrCode: data.totp?.qr_code ?? "",
      secret: data.totp?.secret ?? "",
      uri: data.totp?.uri ?? "",
    },
    error: null,
  };
}

export async function startTotpChallenge(
  supabase: SupabaseClient,
  factorId: string
): Promise<{ challengeId: string | null; error: Error | null }> {
  const mfa = mfaApi(supabase);
  if (!mfa?.challenge) {
    return { challengeId: null, error: new Error("Two-factor authentication is not available in this client.") };
  }
  const { data, error } = await mfa.challenge({ factorId });
  return { challengeId: data?.id ?? null, error: error ?? (!data?.id ? new Error("Could not start two-factor verification.") : null) };
}

/**
 * After email/password sign-in and setSession: if the account uses Supabase MFA (TOTP),
 * returns a challenge to verify. Otherwise `ok`.
 */
export async function prepareMfaStepAfterPassword(supabase: SupabaseClient): Promise<MfaAfterPasswordResult> {
  const mfa = mfaApi(supabase);
  if (!mfa?.getAuthenticatorAssuranceLevel || !mfa.listFactors || !mfa.challenge) {
    return { kind: "ok" };
  }

  const { data: aal, error: aalErr } = await mfa.getAuthenticatorAssuranceLevel();
  if (aalErr) return { kind: "ok" };

  const current = aal?.currentLevel ?? "";
  const next = aal?.nextLevel ?? null;
  const needsAal2 = next === "aal2" && current === "aal1";

  let totpVerified: TotpFactor[];
  try {
    totpVerified = await listVerifiedTotpFactors(supabase);
  } catch {
    return { kind: "ok" };
  }
  const totp = totpVerified[0];

  if (needsAal2 && !totp) {
    return {
      kind: "enrollment_required",
      message:
        "Two-factor authentication is required for your account. Enroll an authenticator app under your user security settings (Supabase MFA / account security), then try again.",
    };
  }

  if (needsAal2 && totp) {
    const { challengeId, error: chErr } = await startTotpChallenge(supabase, totp.id);
    if (chErr || !challengeId) {
      return {
        kind: "enrollment_required",
        message: chErr?.message ?? "Could not start two-factor verification. Try again.",
      };
    }
    return { kind: "totp", factorId: totp.id, challengeId };
  }

  return { kind: "ok" };
}

export async function verifyMfaTotp(
  supabase: SupabaseClient,
  factorId: string,
  challengeId: string,
  code: string
): Promise<{ error: Error | null }> {
  const mfa = mfaApi(supabase);
  if (!mfa?.verify) {
    return { error: new Error("Two-factor authentication is not available in this client.") };
  }
  const digits = code.replace(/\D/g, "");
  const { error } = await mfa.verify({ factorId, challengeId, code: digits });
  return { error };
}

export async function refreshMfaChallenge(
  supabase: SupabaseClient,
  factorId: string
): Promise<{ challengeId: string } | null> {
  const mfa = mfaApi(supabase);
  if (!mfa?.challenge) return null;
  const { data: ch, error } = await mfa.challenge({ factorId });
  if (error || !ch?.id) return null;
  return { challengeId: ch.id };
}
