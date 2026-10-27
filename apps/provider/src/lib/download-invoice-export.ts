import * as FileSystem from "expo-file-system/legacy";
import { Share, Platform } from "react-native";
import { getApiBaseUrl, getAccessToken } from "@/lib/api-client";

/** Download filtered invoice CSV from the provider export API and share/save it. */
export async function downloadInvoiceExportCsv(queryString: string): Promise<void> {
  const base = getApiBaseUrl();
  const token = await getAccessToken();
  if (!base || !token) {
    throw new Error("Sign in required to export invoices.");
  }
  const url = `${base}/api/provider/invoices/export${queryString ? `?${queryString}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Export failed (${res.status})`);
  }
  const csv = await res.text();
  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "provider-invoices.csv";
    a.click();
    URL.revokeObjectURL(href);
    return;
  }
  const path = `${FileSystem.cacheDirectory ?? ""}provider-invoices.csv`;
  await FileSystem.writeAsStringAsync(path, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Share.share({ url: path, title: "Invoices export" });
}
