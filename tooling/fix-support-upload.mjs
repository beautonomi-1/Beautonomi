import fs from "node:fs";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(
  new URL("../apps/web/src/lib/support/support-ticket-attachment-upload.ts", import.meta.url),
);
let s = fs.readFileSync(file, "utf8");

const broken = `  const client = getStorageServiceClientOrUser(supabase);

  if (hasSupabaseStorageServiceRole()) {
    const { data: buckets, error: listErr } = await client.storage.listBuckets();
    if (listErr) {
      console.warn("[support-ticket upload] listBuckets:", listErr.message);
    }
    const bucketExists = buckets?.some((b) => b.name === MESSAGE_ATTACHMENTS_BUCKET) ?? false;
    if (!bucketExists) {
      const { error: createError } = await client.storage.createBucket(MESSAGE_ATTACHMENTS_BUCKET, {
        public: false,
        fileSizeLimit: 52428800,
      });
      if (createError) {
        const msg = createError.message || "";
        if (!/already exists|duplicate/i.test(msg)) {
          throw new Error(
            \`Storage bucket "\${MESSAGE_ATTACHMENTS_BUCKET}" missing and could not be created. Create it in Supabase Dashboard > Storage, or set SUPABASE_SERVICE_ROLE_KEY.\`
          );
        }
      }
    }
  }

  const uploaded: SupportTicketAttachmentMeta[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileExt = file.name.split(".").pop() || "bin";
    const fileName = \`\${SUPPORT_TICKET_ATTACHMENTS_PATH_PREFIX}/\${ticketId}/\${userId}/\${timestamp}-\${i}-\${Math.random().toString(36).substring(7)}.\${fileExt}\`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const meta = await uploadSupportTicketBufferToStorage(client, {
      buffer,
      storagePath,
      contentType: file.type,
      name: file.name,
      size: file.size,
    });
    if (meta) uploaded.push(meta);
  }`;

const fixed = `  const client = getStorageServiceClientOrUser(supabase);
  await ensureMessageAttachmentsBucket(client);

  const uploaded: SupportTicketAttachmentMeta[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const storagePath = storagePathForSupportTicketFile(ticketId, userId, i, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    const meta = await uploadSupportTicketBufferToStorage(client, {
      buffer,
      storagePath,
      contentType: file.type,
      name: file.name,
      size: file.size,
    });
    if (meta) uploaded.push(meta);
  }`;

if (!s.includes("storagePath,")) {
  console.log("Already fixed upload loop");
} else if (!s.includes(broken.slice(0, 80))) {
  console.error("Pattern not found");
  process.exit(1);
} else {
  s = s.replace(broken, fixed);
  fs.writeFileSync(file, s);
  console.log("Fixed", file);
}
