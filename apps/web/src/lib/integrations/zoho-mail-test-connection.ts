import type { SupabaseClient } from "@supabase/supabase-js";
import {
  exchangeZohoGrantCode,
  getZohoAccessTokenForConnection,
  listZohoAccounts,
  listZohoFolders,
  matchAccountForMailbox,
  resolveInboxFolderId,
  ZohoMailApiError,
} from "@/lib/integrations/zoho-mail";

export async function testZohoMailboxConnection(
  supabase: SupabaseClient,
  params: { connectionId: string; mailboxAddress: string },
): Promise<{
  ok: boolean;
  accountId?: string;
  inboxFolderId?: string;
  error?: string;
}> {
  try {
    const { token, connection } = await getZohoAccessTokenForConnection(supabase, params.connectionId);
    const accounts = await listZohoAccounts(connection.data_center, token);
    const account = matchAccountForMailbox(accounts, params.mailboxAddress);
    if (!account) {
      return {
        ok: false,
        error: `Address ${params.mailboxAddress} not found in sendMailDetails for this Zoho account`,
      };
    }
    const folders = await listZohoFolders(connection.data_center, token, account.accountId);
    const inboxFolderId = resolveInboxFolderId(folders, null);
    if (!inboxFolderId) {
      return { ok: false, error: "No Inbox folder (folderType=Inbox) found" };
    }
    await supabase
      .from("support_zoho_connections")
      .update({
        zoho_account_id: account.accountId,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.connectionId);
    return { ok: true, accountId: account.accountId, inboxFolderId };
  } catch (err) {
    const message = err instanceof ZohoMailApiError ? err.message : "Connection test failed";
    return { ok: false, error: message };
  }
}

export async function saveZohoGrantCode(
  supabase: SupabaseClient,
  connectionId: string,
  grantCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: row, error } = await supabase
    .from("support_zoho_connections")
    .select("id, data_center, client_id, client_secret")
    .eq("id", connectionId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "Connection not found" };
  try {
    const tokens = await exchangeZohoGrantCode(row as { data_center: string; client_id: string | null; client_secret: string | null }, grantCode);
    await supabase
      .from("support_zoho_connections")
      .update({
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_token_expires_at: tokens.expires_at,
        auth_status: "ok",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof ZohoMailApiError ? err.message : "Grant exchange failed" };
  }
}
