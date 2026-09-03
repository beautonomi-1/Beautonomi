import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  collectStoragePathsFromAttachmentsJson,
  messageAttachmentRetentionCutoffIso,
  MESSAGE_ATTACHMENTS_BUCKET,
  stripStorageBackedAttachmentsForPersistence,
} from "@/lib/messaging/message-attachments";

import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const PAGE = 200;
const MAX_PAGES = 40;
const JOB_NAME = "expire-message-attachments";
export const maxDuration = 300;

/**
 * GET /api/cron/expire-message-attachments
 *
 * Removes storage objects for chat file attachments past retention and replaces JSON metadata
 * with expired placeholders (offers / custom_request payloads are preserved).
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return new Response(auth.error || "Unauthorized", { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const cutoff = messageAttachmentRetentionCutoffIso();
    let pages = 0;
    let rowsInspected = 0;
    let messagesUpdated = 0;
    let storageObjectsRemoved = 0;
    const marker = "message-attachments";

    for (let offset = 0; pages < MAX_PAGES; pages++) {
      const { data: batch, error } = await admin
        .from("messages")
        .select("id, attachments, created_at")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);

      if (error) throw error;
      if (!batch?.length) break;

      offset += PAGE;

      for (const row of batch) {
        rowsInspected++;
        const raw = row.attachments;
        const serialized = JSON.stringify(raw ?? []);
        if (!serialized.includes(marker)) continue;

        const paths = collectStoragePathsFromAttachmentsJson(raw);
        if (paths.length > 0) {
          const { error: rmErr } = await admin.storage.from(MESSAGE_ATTACHMENTS_BUCKET).remove(paths);
          if (rmErr) {
            console.error("expire-message-attachments: remove failed", rmErr.message);
            // Skip JSON update — preserve references so we can retry storage deletion
            continue;
          }
          storageObjectsRemoved += paths.length;
        }

        const next = stripStorageBackedAttachmentsForPersistence(raw);
        if (JSON.stringify(next) === serialized) continue;

        const { error: upErr } = await admin.from("messages").update({ attachments: next }).eq("id", row.id);
        if (upErr) {
          console.error("expire-message-attachments: update failed", upErr.message);
          continue;
        }
        messagesUpdated++;
      }

      if (batch.length < PAGE) break;
    }

    return successResponse({
      message: "Message attachment expiry pass completed",
      cutoff,
      pages,
      rowsInspected,
      messagesUpdated,
      storageObjectsRemoved,
    });
  } catch (error) {
    return handleApiError(error, "Failed to expire message attachments");
  }
}
