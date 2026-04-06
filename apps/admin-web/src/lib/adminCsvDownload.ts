import { adminApi } from "@/lib/adminClient";

/** CSV/binary export via **`adminApi.downloadBlob`** (superadmin tenant scope on GET, shared error shape). */
export async function downloadAdminBlob(pathWithLeadingSlash: string, filename: string): Promise<void> {
  const blob = await adminApi.downloadBlob(pathWithLeadingSlash, { timeoutMs: 120_000 });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
