import { Alert, Platform, Share as RNShare } from "react-native";
import type { Router } from "expo-router";
import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
import { api, getApiBaseUrl } from "@/lib/api-client";
import { webApiTenantHeaders } from "@/config/public-env";
import { supabase } from "@/lib/supabase/client";
import { pushInAppBrowser } from "@/lib/in-app-web";

/**
 * Download or share a terminal order receipt PDF (Bearer first, signed-url fallback).
 */
export async function downloadTerminalOrderReceipt(
  orderId: string,
  router: Router,
  opts?: { productName?: string },
): Promise<void> {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const safeName = `terminal_order_${orderId.replace(/[^\w.-]+/g, "_")}.pdf`;
  const pdfPath = `/api/provider/terminal-orders/${encodeURIComponent(orderId)}/receipt/pdf`;

  const tryBearerDownload = async (): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token || !base) return false;
    const pdfUrl = `${base}${pdfPath}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...webApiTenantHeaders(),
    };
    if (Platform.OS === "web") {
      const r = await fetch(pdfUrl, { headers, credentials: "omit" });
      if (!r.ok) return false;
      const blob = await r.blob();
      const objUrl = URL.createObjectURL(blob);
      if (typeof window !== "undefined") {
        window.open(objUrl, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(objUrl), 120_000);
      }
      return true;
    }
    if (!cacheDirectory) return false;
    const fileUri = `${cacheDirectory}${safeName}`;
    const dl = await downloadAsync(pdfUrl, fileUri, { headers });
    if (dl.status !== 200) return false;
    await RNShare.share({
      url: fileUri,
      message: opts?.productName ?? "Terminal order receipt",
    });
    return true;
  };

  if (await tryBearerDownload()) return;

  const res = await api.post<{ url?: string }>(
    `${pdfPath.replace("/receipt/pdf", "/receipt/signed-url")}`,
    {},
  );
  const signedUrl = res.data?.url;
  if (res.error || !signedUrl) {
    const msg =
      (res.error as { message?: string } | null)?.message ??
      "Could not generate this receipt. Please try again.";
    Alert.alert("Download receipt", msg);
    return;
  }

  if (Platform.OS === "web") {
    pushInAppBrowser(router, signedUrl, "Terminal order receipt");
    return;
  }

  if (!cacheDirectory) {
    Alert.alert("Download receipt", "File storage is not available on this device.");
    return;
  }

  const fileUri = `${cacheDirectory}${safeName}`;
  const dl = await downloadAsync(signedUrl, fileUri);
  if (dl.status !== 200) {
    const hint =
      dl.status === 401 || dl.status === 403
        ? "Your session may have expired. Please try again."
        : `The server returned status ${dl.status}.`;
    Alert.alert("Download receipt", `Could not download the PDF. ${hint}`);
    return;
  }

  await RNShare.share({
    url: fileUri,
    message: opts?.productName ?? "Terminal order receipt",
  });
}
