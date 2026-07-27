import { Alert, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { haptic } from "@/lib/haptics";

const BRAND_NAME = "Beautonomi";
const CUSTOMER_SCHEME = "customer://";

export type ShareExplorePostInput = {
  postId: string;
  caption?: string | null;
  providerName: string;
  providerSlug?: string;
  mediaUrls?: string[];
  /** Tenant-aware marketing site base, e.g. https://beautonomi.com */
  webBaseUrl: string;
  /** Which carousel item is active when sharing media (default 0). */
  mediaIndex?: number;
};

export function isExploreVideoUrl(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0] ?? "";
  return lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov") || lower.endsWith(".m4v");
}

function buildWebUrl(base: string, postId: string): string {
  const b = base.replace(/\/$/, "");
  return `${b}/explore/${postId}`;
}

function buildAppUrl(postId: string): string {
  return `${CUSTOMER_SCHEME}explore-post?id=${encodeURIComponent(postId)}`;
}

function truncateCaption(caption: string, max = 140): string {
  const trimmed = caption.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** Branded share copy — caption, provider credit, link (TikTok / Instagram style). */
export function buildExplorePostShareMessage(opts: ShareExplorePostInput): string {
  const { caption, providerName, postId, webBaseUrl } = opts;
  const web = buildWebUrl(webBaseUrl, postId);
  const lines: string[] = [];

  if (caption?.trim()) {
    lines.push(truncateCaption(caption));
    lines.push("");
  }

  lines.push(`@${providerName} on ${BRAND_NAME}`);
  lines.push(web);

  if (Platform.OS !== "web") {
    lines.push(`Open in app: ${buildAppUrl(postId)}`);
  }

  return lines.join("\n");
}

export async function copyExplorePostLink(opts: ShareExplorePostInput): Promise<void> {
  const url = buildWebUrl(opts.webBaseUrl, opts.postId);
  await Clipboard.setStringAsync(url);
  haptic.light();
}

export async function shareExplorePostLink(opts: ShareExplorePostInput): Promise<void> {
  const message = buildExplorePostShareMessage(opts);
  const web = buildWebUrl(opts.webBaseUrl, opts.postId);
  const title = opts.caption?.trim()
    ? truncateCaption(opts.caption, 80)
    : `${opts.providerName} on ${BRAND_NAME}`;

  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title, text: message, url: web });
      return;
    }
    await Share.share(
      Platform.OS === "ios" ? { message, url: web, title } : { message, title },
    );
  } catch {
    /* user cancelled */
  }
}

function extensionForMediaUrl(url: string, isVideo: boolean): string {
  const path = url.toLowerCase().split("?")[0] ?? "";
  const ext = path.split(".").pop();
  if (ext && ext.length <= 5) return ext;
  return isVideo ? "mp4" : "jpg";
}

function mimeForMedia(isVideo: boolean, ext: string): string {
  if (isVideo) {
    if (ext === "mov") return "video/quicktime";
    if (ext === "webm") return "video/webm";
    return "video/mp4";
  }
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

/**
 * Share the post media file via the native share sheet (Instagram, WhatsApp, Save, etc.).
 * Falls back to link share when download fails.
 */
export async function shareExplorePostMedia(opts: ShareExplorePostInput): Promise<void> {
  const index = opts.mediaIndex ?? 0;
  const mediaUrl = opts.mediaUrls?.[index];
  if (!mediaUrl) {
    await shareExplorePostLink(opts);
    return;
  }

  const isVideo = isExploreVideoUrl(mediaUrl);
  const ext = extensionForMediaUrl(mediaUrl, isVideo);
  const mimeType = mimeForMedia(isVideo, ext);
  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!cacheDir) {
    await shareExplorePostLink(opts);
    return;
  }

  const localUri = `${cacheDir}beautonomi-explore-${opts.postId}-${index}.${ext}`;

  try {
    const downloaded = await FileSystem.downloadAsync(mediaUrl, localUri);
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      await shareExplorePostLink(opts);
      return;
    }

    await Sharing.shareAsync(downloaded.uri, {
      mimeType,
      dialogTitle: `${BRAND_NAME} — ${opts.providerName}`,
      UTI: isVideo ? "public.movie" : "public.jpeg",
    });
  } catch {
    Alert.alert(
      "Couldn't share media",
      "We couldn't prepare this file for sharing. Try sharing the link instead.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Share link", onPress: () => void shareExplorePostLink(opts) },
      ],
    );
  }
}

export type ExploreShareAction = "link" | "media" | "copy";

/** Present share options like Instagram / TikTok: link, media file, or copy link. */
export async function presentExplorePostShareActions(
  opts: ShareExplorePostInput,
  labels: {
    sheetTitle: string;
    shareLink: string;
    shareMedia: string;
    shareMediaVideo: string;
    copyLink: string;
    cancel: string;
  },
  onAction: (action: ExploreShareAction) => void | Promise<void>,
): Promise<void> {
  const index = opts.mediaIndex ?? 0;
  const hasMedia = Boolean(opts.mediaUrls?.[index]);
  const isVideo = hasMedia && isExploreVideoUrl(opts.mediaUrls![index]!);

  const buttons: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [
    { text: labels.shareLink, onPress: () => void onAction("link") },
  ];

  if (hasMedia) {
    buttons.push({
      text: isVideo ? labels.shareMediaVideo : labels.shareMedia,
      onPress: () => void onAction("media"),
    });
  }

  buttons.push(
    { text: labels.copyLink, onPress: () => void onAction("copy") },
    { text: labels.cancel, style: "cancel" },
  );

  Alert.alert(labels.sheetTitle, undefined, buttons);
}
