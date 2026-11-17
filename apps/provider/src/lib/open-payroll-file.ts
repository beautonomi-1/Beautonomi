import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { webApiTenantHeaders } from "@/config/public-env";
import { getActiveProviderApiHint } from "@/lib/active-provider-api-hint";
import { getApiBaseUrl } from "@/lib/api-client";
import { getDeviceKeyHeaderValue } from "@/lib/security/device-key";
import { supabase } from "@/lib/supabase/client";

/** Download an authenticated payroll file and open the share sheet. Returns an error message, or null. */
export async function sharePayrollFile(
  path: string,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const cacheDir = FileSystem.cacheDirectory;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!base || !cacheDir || !token) return "You need to be signed in.";

  const fileUri = `${cacheDir}${filename.replace(/[^\w.-]+/g, "_")}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-App": "provider",
    ...webApiTenantHeaders(),
  };
  const providerId = getActiveProviderApiHint();
  if (providerId) headers["x-provider-id"] = providerId;
  try {
    const deviceKey = await getDeviceKeyHeaderValue();
    if (deviceKey) headers["X-Device-Key"] = deviceKey;
  } catch {
    // The payslip route still accepts the session when no device key is stored.
  }
  const downloaded = await FileSystem.downloadAsync(`${base}${path}`, fileUri, { headers });
  if (downloaded.status !== 200) {
    return downloaded.status === 400
      ? "This file is available after the pay run is approved."
      : "Could not open this file.";
  }
  if (!(await Sharing.isAvailableAsync())) return "Sharing is not available on this device.";
  await Sharing.shareAsync(downloaded.uri, { mimeType, dialogTitle: filename });
  return null;
}
