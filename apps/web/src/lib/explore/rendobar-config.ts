import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type RendobarSecrets = {
  apiKey: string | null;
  callbackSecret: string | null;
  storageConnectionId: string | null;
};

export async function loadRendobarSecrets(): Promise<RendobarSecrets> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("platform_secrets")
    .select("rendobar_api_key, rendobar_callback_secret, rendobar_storage_connection_id")
    .limit(1)
    .maybeSingle();

  const row = data as {
    rendobar_api_key?: string | null;
    rendobar_callback_secret?: string | null;
    rendobar_storage_connection_id?: string | null;
  } | null;

  return {
    apiKey: row?.rendobar_api_key?.trim() || process.env.RENDOBAR_API_KEY?.trim() || null,
    callbackSecret:
      row?.rendobar_callback_secret?.trim() || process.env.RENDOBAR_CALLBACK_SECRET?.trim() || null,
    storageConnectionId:
      row?.rendobar_storage_connection_id?.trim() ||
      process.env.RENDOBAR_STORAGE_CONNECTION_ID?.trim() ||
      null,
  };
}

/** Public HTTPS origin for Rendobar per-job callbacks (required by Rendobar SSRF rules). */
export function explorePublicAppBaseUrl(): string | null {
  const base =
    process.env.APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "";
  return base || null;
}

export function exploreWebhookBaseUrl(): string {
  const base = explorePublicAppBaseUrl();
  return base ? `${base}/api/webhooks/rendobar` : "/api/webhooks/rendobar";
}

/** Jobs + signed callbacks can run (API key, storage connection, callback verify secret, public APP_URL). */
export function rendobarIntegrationReady(secrets: RendobarSecrets): boolean {
  return !!(
    secrets.apiKey &&
    secrets.storageConnectionId &&
    secrets.callbackSecret &&
    explorePublicAppBaseUrl()
  );
}
