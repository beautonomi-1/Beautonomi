import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { isProviderOwner } from "@/lib/auth/permissions";
import {
  buildShippingRuntimeFromProviderRow,
  loadProviderCourierCredentialsRow,
  mergeEncryptedAramex,
  mergeEncryptedBobGo,
  mergeEncryptedCourierGuy,
  publicCourierCredentialsStatus,
  upsertProviderCourierCredentials,
} from "@/lib/orders/provider-shipping-credentials";
import { mergeBobGoWebhookSecretCiphertext } from "@/lib/orders/bob-go-webhook-auth";
import { ensureBobGoWebhookSubscriptions } from "@/lib/orders/bob-go-webhook-subscribe";

const putSchema = z.object({
  courier_guy: z
    .object({
      apiKey: z.string().optional(),
      baseUrl: z.string().max(500).nullable().optional(),
      clear: z.boolean().optional(),
    })
    .optional(),
  bob_go: z
    .object({
      apiKey: z.string().optional(),
      baseUrl: z.string().max(500).nullable().optional(),
      webhookSecret: z.string().max(500).optional(),
      clearWebhookSecret: z.boolean().optional(),
      clear: z.boolean().optional(),
    })
    .optional(),
  aramex: z
    .object({
      accountNumber: z.string().optional(),
      accountPin: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      source: z.number().int().positive().optional(),
      baseUrl: z.string().max(500).nullable().optional(),
      accountEntity: z.string().max(20).nullable().optional(),
      accountCountryCode: z.string().max(5).nullable().optional(),
      domesticProductType: z.string().max(10).nullable().optional(),
      clear: z.boolean().optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const owner = await isProviderOwner(user.id, request);
    const admin = getSupabaseAdmin();
    const row = await loadProviderCourierCredentialsRow(admin, providerId);
    const status = publicCourierCredentialsStatus(row, { includeHints: owner });

    return successResponse({ status });
  } catch (err) {
    return handleApiError(err, "Failed to load courier credentials");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const owner = await isProviderOwner(user.id, request);
    if (!owner) {
      return errorResponse("Only the business owner can update courier credentials", "FORBIDDEN", 403);
    }

    const parsed = putSchema.parse(await request.json());
    const admin = getSupabaseAdmin();
    const existing = await loadProviderCourierCredentialsRow(admin, providerId);

    const patch: Record<string, unknown> = {};

    if (parsed.courier_guy) {
      patch.courier_guy_ciphertext = mergeEncryptedCourierGuy(existing, parsed.courier_guy);
      if (parsed.courier_guy.baseUrl !== undefined) {
        patch.courier_guy_base_url = parsed.courier_guy.baseUrl;
      }
      if (parsed.courier_guy.clear) patch.courier_guy_verified_at = null;
    }
    if (parsed.bob_go) {
      patch.bob_go_ciphertext = mergeEncryptedBobGo(existing, parsed.bob_go);
      if (parsed.bob_go.baseUrl !== undefined) {
        patch.bob_go_base_url = parsed.bob_go.baseUrl;
      }
      if (parsed.bob_go.clear) patch.bob_go_verified_at = null;
      patch.bob_go_webhook_secret_ciphertext = mergeBobGoWebhookSecretCiphertext(existing, {
        webhookSecret: parsed.bob_go.webhookSecret,
        clear: parsed.bob_go.clearWebhookSecret,
      });
    }
    if (parsed.aramex) {
      patch.aramex_ciphertext = mergeEncryptedAramex(existing, parsed.aramex);
      if (parsed.aramex.baseUrl !== undefined) patch.aramex_base_url = parsed.aramex.baseUrl;
      if (parsed.aramex.accountEntity !== undefined) patch.aramex_account_entity = parsed.aramex.accountEntity;
      if (parsed.aramex.accountCountryCode !== undefined) {
        patch.aramex_account_country_code = parsed.aramex.accountCountryCode;
      }
      if (parsed.aramex.domesticProductType !== undefined) {
        patch.aramex_domestic_product_type = parsed.aramex.domesticProductType;
      }
      if (parsed.aramex.clear) patch.aramex_verified_at = null;
    }

    if (Object.keys(patch).length === 0) {
      return errorResponse("No credential fields to update", "VALIDATION_ERROR", 400);
    }

    const row = await upsertProviderCourierCredentials(admin, providerId, patch as any);
    const status = publicCourierCredentialsStatus(row, { includeHints: true });

    let bobGoWebhookSubscribe: { ok: boolean; error?: string } | null = null;
    if (parsed.bob_go && row.bob_go_ciphertext) {
      const runtime = buildShippingRuntimeFromProviderRow(row, "bob-go");
      if (runtime?.["bob-go"]) {
        bobGoWebhookSubscribe = await ensureBobGoWebhookSubscriptions(runtime["bob-go"]);
      }
    }

    return successResponse({
      status,
      bob_go_webhook_subscribe: bobGoWebhookSubscribe,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("SHIPPING_CREDENTIALS_ENCRYPTION_KEY")) {
      return errorResponse(err.message, "CONFIG_ERROR", 503);
    }
    return handleApiError(err, "Failed to save courier credentials");
  }
}
