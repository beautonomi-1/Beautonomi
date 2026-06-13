import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneToE164 } from "@/lib/phone";
import { createWalkInEmail, isShadowEmail } from "@/lib/users/shadow-email";

export type ShadowCustomerSource =
  | "provider_booking"
  | "provider_client_create"
  | "product_sale"
  | "waiting_room"
  | "group_booking";

export interface CreateShadowCustomerInput {
  supabaseAdmin: SupabaseClient;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  phoneCountryCode?: string | null;
  providerId?: string | null;
  shadowSource: ShadowCustomerSource;
  createdByUserId?: string | null;
}

export interface CreateShadowCustomerResult {
  ok: true;
  customerId: string;
  email: string;
  phone: string | null;
  matchedExisting: boolean;
  matchedOn: "email" | "phone" | null;
  isShadow: boolean;
}

export interface CreateShadowCustomerError {
  ok: false;
  message: string;
  code: string;
}

type BypassRpcResult = {
  success?: boolean;
  user_id?: string;
  error?: string;
};

async function waitForUserProfileRow(supabaseAdmin: SupabaseClient, userId: string) {
  for (let i = 0; i < 5; i++) {
    const { data } = await supabaseAdmin.from("users").select("id").eq("id", userId).maybeSingle();
    if (data?.id) return;
    await new Promise((r) => setTimeout(r, 80));
  }
}

export async function createOrResolveShadowCustomer(
  input: CreateShadowCustomerInput,
): Promise<CreateShadowCustomerResult | CreateShadowCustomerError> {
  const {
    supabaseAdmin,
    fullName,
    providerId,
    shadowSource,
    createdByUserId,
    phoneCountryCode,
  } = input;

  const nameTrim = fullName.trim();
  if (!nameTrim) {
    return { ok: false, message: "Customer name is required.", code: "VALIDATION_ERROR" };
  }

  const emailRaw = input.email?.trim().toLowerCase() ?? "";
  const phoneRaw = input.phone?.trim() ?? "";
  const phoneNorm = phoneRaw
    ? normalizePhoneToE164(phoneRaw, phoneCountryCode ?? undefined) || phoneRaw
    : null;

  const email =
    emailRaw && isRealCustomerEmailForLookup(emailRaw) ? emailRaw : createWalkInEmail();

  let customerId: string | null = null;
  let matchedExisting = false;
  let matchedOn: "email" | "phone" | null = null;

  if (emailRaw && isRealCustomerEmailForLookup(emailRaw)) {
    const { data: byEmail } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", emailRaw)
      .maybeSingle();
    if (byEmail?.id) {
      customerId = byEmail.id as string;
      matchedExisting = true;
      matchedOn = "email";
    }
  }

  if (!customerId && (phoneRaw || phoneNorm)) {
    const phoneCandidates = [...new Set([phoneRaw, phoneNorm].filter((v): v is string => Boolean(v)))];
    const { data: byPhone } = await supabaseAdmin
      .from("users")
      .select("id")
      .in("phone", phoneCandidates)
      .limit(1);
    if (byPhone?.[0]?.id) {
      customerId = byPhone[0].id as string;
      matchedExisting = true;
      matchedOn = "phone";
    }
  }

  const shadowMetadata = {
    is_shadow: true,
    shadow_source: shadowSource,
    created_by_provider_id: providerId ?? null,
    created_by_user_id: createdByUserId ?? null,
  };

  if (!customerId) {
    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      phone: phoneNorm ?? undefined,
      email_confirm: true,
      user_metadata: {
        full_name: nameTrim,
        phone: phoneNorm || phoneRaw || null,
        role: "customer",
        ...shadowMetadata,
      },
    });

    if (createUserError || !createdUser?.user?.id) {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("create_user_bypass_trigger", {
        p_email: email,
        p_full_name: nameTrim,
        p_phone: phoneNorm || phoneRaw || null,
        p_role: "customer",
        p_metadata: shadowMetadata,
      });

      if (rpcErr) {
        return {
          ok: false,
          message: rpcErr.message || createUserError?.message || "Failed to create customer.",
          code: "USER_CREATE_ERROR",
        };
      }

      const bypass = rpcData as BypassRpcResult | BypassRpcResult[] | null;
      const payload = Array.isArray(bypass) ? bypass[0] : bypass;
      if (!payload?.success || !payload.user_id) {
        return {
          ok: false,
          message: payload?.error || createUserError?.message || "Failed to create customer.",
          code: "USER_CREATE_ERROR",
        };
      }
      customerId = payload.user_id;
    } else {
      customerId = createdUser.user.id;
      await waitForUserProfileRow(supabaseAdmin, customerId);

      const { data: profile } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("id", customerId)
        .maybeSingle();

      if (!profile) {
        const { error: insertErr } = await supabaseAdmin.from("users").insert({
          id: customerId,
          email,
          full_name: nameTrim,
          phone: phoneNorm || phoneRaw || null,
          role: "customer",
          is_shadow: true,
        });
        if (insertErr) {
          return { ok: false, message: insertErr.message, code: "USER_CREATE_ERROR" };
        }
      }
    }
  }

  if (!customerId) {
    return { ok: false, message: "Failed to resolve customer.", code: "USER_CREATE_ERROR" };
  }

  if (!matchedExisting) {
    // Only newly-created shadow accounts get their profile stamped here.
    // Matched existing users (possibly registered) must keep their own data.
    const profileUpdates: Record<string, unknown> = {
      full_name: nameTrim,
      is_shadow: true,
    };
    if (phoneNorm || phoneRaw) profileUpdates.phone = phoneNorm || phoneRaw;
    await supabaseAdmin.from("users").update(profileUpdates).eq("id", customerId);
  }

  const { data: finalUser } = await supabaseAdmin
    .from("users")
    .select("email, phone, is_shadow")
    .eq("id", customerId)
    .maybeSingle();

  return {
    ok: true,
    customerId,
    email: (finalUser?.email as string) ?? email,
    phone: (finalUser?.phone as string | null) ?? phoneNorm ?? phoneRaw ?? null,
    matchedExisting,
    matchedOn,
    isShadow: Boolean(finalUser?.is_shadow) || isShadowEmail(email),
  };
}

function isRealCustomerEmailForLookup(email: string): boolean {
  return email.includes("@") && !isShadowEmail(email);
}
