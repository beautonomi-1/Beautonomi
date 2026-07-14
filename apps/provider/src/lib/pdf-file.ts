import { Alert, Platform, ToastAndroid } from "react-native";
import type { Router } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, getApiBaseUrl } from "@/lib/api-client";
import { webApiTenantHeaders } from "@/config/public-env";
import { supabase } from "@/lib/supabase/client";

/**
 * §receipt-downloads 2026-07 — platform-native PDF save/share.
 *
 * Every "Download receipt/invoice" entry point in the app should go through
 * `downloadPdf()` below instead of reimplementing the fetch-then-share dance.
 * Behavior by platform:
 *   - Android: saves straight into a user-chosen folder (defaults to
 *     Downloads) via the Storage Access Framework, with a toast + an "Open"
 *     action — this is the closest thing Android has to a Downloads save.
 *   - iOS: there is no Downloads folder, so we open a full-screen in-app PDF
 *     preview with a Share action that surfaces "Save to Files" correctly
 *     (proper UTI/mime, unlike a bare `Share.share`).
 *   - Web: unchanged blob/anchor download.
 * Use `sharePdfFlow()` for explicit "Share" buttons that should always open
 * the share sheet (no native save, no preview detour).
 */

const SAVE_DIR_STORAGE_KEY = "beautonomi_pdf_save_dir_uri_v1";
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const ANDROID_ACTION_VIEW = "android.intent.action.VIEW";

export const PDF_PREVIEW_PATH = "/(app)/(tabs)/more/pdf-preview" as const;

export type PdfFetchResult = { ok: true; fileUri: string } | { ok: false; error: string };

export interface PdfFlowParams {
  router: Router;
  /** Bearer-authenticated GET endpoint returning `application/pdf`. */
  pdfPath: string;
  /** POST endpoint minting a short-lived signed URL fallback. Omit if none exists. */
  signedUrlPath?: string;
  /** Suggested file name; ".pdf" is appended automatically if missing. */
  filename: string;
  /** Screen title shown in the preview header / share dialog. */
  title: string;
  /** Human label used in alerts, e.g. "receipt" or "invoice". Defaults to `title`. */
  label?: string;
}

function safeFilename(filename: string): string {
  const cleaned = filename.replace(/[^\w.-]+/g, "_");
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, ...webApiTenantHeaders() };
}

/** Bearer-first, signed-url-fallback download into the app cache. Native only. */
export async function fetchPdfToCache(opts: {
  pdfPath: string;
  signedUrlPath?: string;
  filename: string;
}): Promise<PdfFetchResult> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return { ok: false, error: "File storage is not available on this device." };
  const fileUri = `${cacheDir}${opts.filename}`;

  const base = getApiBaseUrl().replace(/\/$/, "");
  const headers = await authHeaders();
  if (headers && base) {
    try {
      const dl = await FileSystem.downloadAsync(`${base}${opts.pdfPath}`, fileUri, { headers });
      if (dl.status === 200) return { ok: true, fileUri };
    } catch {
      // fall through to signed-url path
    }
  }

  if (!opts.signedUrlPath) {
    return {
      ok: false,
      error: !headers
        ? "You need to be signed in to download this PDF."
        : "Could not download the PDF. Please try again.",
    };
  }

  const res = await api.post<{ url?: string }>(opts.signedUrlPath, {});
  const signedUrl = res.data?.url;
  if (res.error || !signedUrl) {
    const msg =
      (res.error as { message?: string } | null)?.message ??
      "Could not generate this PDF. Please try again.";
    return { ok: false, error: msg };
  }

  try {
    const dl = await FileSystem.downloadAsync(signedUrl, fileUri);
    if (dl.status !== 200) {
      const hint =
        dl.status === 401 || dl.status === 403
          ? "Your session may have expired. Please try again."
          : `The server returned status ${dl.status}.`;
      return { ok: false, error: `Could not download the PDF. ${hint}` };
    }
    return { ok: true, fileUri };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Download failed." };
  }
}

/** Web: blob+anchor download, falling back to opening the signed URL in a new tab. */
async function openPdfOnWeb(opts: {
  pdfPath: string;
  signedUrlPath?: string;
  filename: string;
  label: string;
}): Promise<void> {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const headers = await authHeaders();
  if (headers && base && typeof window !== "undefined") {
    try {
      const r = await fetch(`${base}${opts.pdfPath}`, { headers, credentials: "omit" });
      if (r.ok) {
        const blob = await r.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = opts.filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
        return;
      }
    } catch {
      // fall through to signed-url path
    }
  }

  if (!opts.signedUrlPath) {
    Alert.alert(`Download ${opts.label}`, "Could not download the PDF. Please try again.");
    return;
  }

  const res = await api.post<{ url?: string }>(opts.signedUrlPath, {});
  const signedUrl = res.data?.url;
  if (res.error || !signedUrl) {
    Alert.alert(
      `Download ${opts.label}`,
      (res.error as { message?: string } | null)?.message ?? "Could not generate this PDF.",
    );
    return;
  }
  if (typeof window !== "undefined") window.open(signedUrl, "_blank", "noopener,noreferrer");
}

async function ensureSaveDirectoryUri(): Promise<string | null> {
  const cached = await AsyncStorage.getItem(SAVE_DIR_STORAGE_KEY);
  if (cached) return cached;
  const hint = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot("Download");
  const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(hint);
  if (!perm.granted) return null;
  await AsyncStorage.setItem(SAVE_DIR_STORAGE_KEY, perm.directoryUri);
  return perm.directoryUri;
}

function openContentUri(contentUri: string): void {
  void IntentLauncher.startActivityAsync(ANDROID_ACTION_VIEW, {
    data: contentUri,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type: "application/pdf",
  }).catch(() => {});
}

/** Android: save the cached PDF into a user-chosen folder (remembered for next time). */
async function saveToDeviceAndroid(cacheFileUri: string, filename: string, label: string): Promise<void> {
  const dirUri = await ensureSaveDirectoryUri();
  if (!dirUri) {
    Alert.alert(`Save ${label}`, "Choose a folder to save the PDF into, then try again.");
    return;
  }
  try {
    const base64 = await FileSystem.readAsStringAsync(cacheFileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const nameWithoutExt = filename.replace(/\.pdf$/i, "");
    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
      dirUri,
      nameWithoutExt,
      "application/pdf",
    );
    await FileSystem.StorageAccessFramework.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    ToastAndroid.show(`${label} saved`, ToastAndroid.SHORT);
    Alert.alert(`${label} saved`, "The PDF was saved to your chosen folder.", [
      { text: "OK", style: "cancel" },
      { text: "Open", onPress: () => openContentUri(destUri) },
    ]);
  } catch {
    // Permission may have been revoked since it was granted — clear and let the
    // next tap re-prompt the folder picker instead of failing silently forever.
    await AsyncStorage.removeItem(SAVE_DIR_STORAGE_KEY);
    Alert.alert(
      `Save ${label}`,
      "Could not save to that folder. Please try again — you'll be asked to choose the folder once more.",
    );
  }
}

function pushPdfPreview(router: Router, fileUri: string, title: string): void {
  router.push({
    pathname: PDF_PREVIEW_PATH,
    params: { uri: encodeURIComponent(fileUri), title: encodeURIComponent(title) },
  } as never);
}

/** Explicit share action (proper PDF UTI/mime) — used by "Share" buttons and the iOS preview header. */
export async function sharePdf(fileUri: string, opts?: { dialogTitle?: string }): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    Alert.alert("Sharing unavailable", "This device does not support the share sheet.");
    return;
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: opts?.dialogTitle,
  });
}

/**
 * "Download" action: platform-native save on Android, in-app preview (with a
 * correctly-typed Share option) on iOS, blob download on web.
 */
export async function downloadPdf(params: PdfFlowParams): Promise<void> {
  const { router, pdfPath, signedUrlPath, title } = params;
  const label = params.label ?? title;
  const filename = safeFilename(params.filename);

  if (Platform.OS === "web") {
    await openPdfOnWeb({ pdfPath, signedUrlPath, filename, label });
    return;
  }

  const result = await fetchPdfToCache({ pdfPath, signedUrlPath, filename });
  if (!result.ok) {
    Alert.alert(`Download ${label}`, result.error);
    return;
  }

  if (Platform.OS === "android") {
    await saveToDeviceAndroid(result.fileUri, filename, label);
    return;
  }

  pushPdfPreview(router, result.fileUri, title);
}

/** "Share" action: always opens the share sheet directly (no native save, no preview). */
export async function sharePdfFlow(params: Omit<PdfFlowParams, "router">): Promise<void> {
  const { pdfPath, signedUrlPath, title } = params;
  const label = params.label ?? title;
  const filename = safeFilename(params.filename);

  if (Platform.OS === "web") {
    await openPdfOnWeb({ pdfPath, signedUrlPath, filename, label });
    return;
  }

  const result = await fetchPdfToCache({ pdfPath, signedUrlPath, filename });
  if (!result.ok) {
    Alert.alert(`Share ${label}`, result.error);
    return;
  }
  await sharePdf(result.fileUri, { dialogTitle: title });
}
