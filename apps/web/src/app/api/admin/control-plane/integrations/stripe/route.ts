/**
 * GET /api/admin/control-plane/integrations/stripe
 * Stripe integration health (mirrors Didit control-plane pattern).
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getStripeSecretKey, getStripeWebhookSecret } from "@/lib/payments/stripe-server";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const missingEnvVars: string[] = [];
    if (!process.env.STRIPE_SECRET_KEY) missingEnvVars.push("STRIPE_SECRET_KEY");
    if (!process.env.STRIPE_WEBHOOK_SECRET) missingEnvVars.push("STRIPE_WEBHOOK_SECRET");

    let secretResolvable = false;
    try {
      await getStripeSecretKey({});
      secretResolvable = true;
    } catch {
      secretResolvable = false;
    }

    let webhookSecretResolvable = false;
    try {
      await getStripeWebhookSecret({});
      webhookSecretResolvable = true;
    } catch {
      webhookSecretResolvable = false;
    }

    return successResponse({
      secret_key_set: Boolean(process.env.STRIPE_SECRET_KEY) || secretResolvable,
      webhook_secret_set: Boolean(process.env.STRIPE_WEBHOOK_SECRET) || webhookSecretResolvable,
      missing_env_vars: missingEnvVars,
      webhook_url: appUrl ? `${appUrl}/api/payments/stripe/webhook` : null,
      connect_supported: true,
      env_complete: secretResolvable && webhookSecretResolvable,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Stripe integration status");
  }
}
