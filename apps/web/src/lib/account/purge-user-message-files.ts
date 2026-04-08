import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MESSAGE_ATTACHMENTS_BUCKET,
  collectStoragePathsFromAttachmentsJson,
} from "@/lib/messaging/message-attachments";

const CHUNK = 100;

/**
 * Deletes objects in `message-attachments` for every conversation the user participated in
 * (as customer or owning provider), plus any extra rows where they were the sender.
 * Call before auth.admin.deleteUser so we can still resolve conversation scope by user id.
 */
export async function purgeUserMessageAttachmentFiles(
  admin: SupabaseClient,
  userId: string
): Promise<{ removed: number }> {
  const pathSet = new Set<string>();

  const { data: providers } = await admin.from("providers").select("id").eq("user_id", userId);
  const providerIds = (providers || []).map((p: { id: string }) => p.id);

  let conversationIds: string[] = [];
  if (providerIds.length > 0) {
    const { data: convs } = await admin
      .from("conversations")
      .select("id")
      .or(`customer_id.eq.${userId},provider_id.in.(${providerIds.join(",")})`);
    conversationIds = (convs || []).map((c: { id: string }) => c.id);
  } else {
    const { data: convs } = await admin.from("conversations").select("id").eq("customer_id", userId);
    conversationIds = (convs || []).map((c: { id: string }) => c.id);
  }

  if (conversationIds.length > 0) {
    const { data: msgs } = await admin
      .from("messages")
      .select("attachments")
      .in("conversation_id", conversationIds);
    for (const m of msgs || []) {
      for (const p of collectStoragePathsFromAttachmentsJson((m as { attachments?: unknown }).attachments)) {
        pathSet.add(p);
      }
    }
  }

  const { data: sentMsgs } = await admin.from("messages").select("attachments").eq("sender_id", userId);
  for (const m of sentMsgs || []) {
    for (const p of collectStoragePathsFromAttachmentsJson((m as { attachments?: unknown }).attachments)) {
      pathSet.add(p);
    }
  }

  const paths = [...pathSet];
  if (paths.length === 0) return { removed: 0 };

  for (let i = 0; i < paths.length; i += CHUNK) {
    const slice = paths.slice(i, i + CHUNK);
    const { error } = await admin.storage.from(MESSAGE_ATTACHMENTS_BUCKET).remove(slice);
    if (error) {
      console.error("purgeUserMessageAttachmentFiles: storage.remove failed", error.message);
    }
  }

  return { removed: paths.length };
}
