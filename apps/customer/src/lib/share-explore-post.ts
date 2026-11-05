import { Alert, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { haptic } from "@/lib/haptics";
import { isExploreVideoPathOrUrl } from "@/lib/explore-media";
import { deliveredExploreVideoShareUrl } from "@/lib/explore-video-playback-trim";
import type { ExploreMediaSlideMeta } from "@/types/api";

const BRAND_NAME = "Beautonomi";

export type ShareExplorePostInput = {
  postId: string;
  caption?: string | null;
  providerName: string;
  providerSlug?: string;
  mediaUrls?: string[];
  displayUrl?: string | null;
  playbackPath?: string | null;
  mediaMeta?: ExploreMediaSlideMeta[] | null;
  /** Tenant-aware marketing site base, e.g. https://beautonomi.com */
  webBaseUrl: string;
  /** Which carousel item is active when sharing media (default 0). */
  mediaIndex?: number;
};

export function isExploreVideoUrl(url: string): boolean {
  return isExploreVideoPathOrUrl(url);
}

function buildWebUrl(base: string, postId: string): string {
  const b = base.replace(/^http:\/\//i, "https://").replace(/\/$/, "");
  return `${b}/explore/${postId}`;
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

  return lines.join("\n");
}

function shareSlideIsVideo(opts: ShareExplorePostInput, index: number): boolean {
  const slideMeta = opts.mediaMeta?.[index];
  const mediaUrl = opts.mediaUrls?.[index];
  return (
    slideMeta?.kind === "video" ||
    (slideMeta?.kind !== "image" && mediaUrl != null && isExploreVideoUrl(mediaUrl))
  );
}

export function resolveShareMediaUrl(opts: ShareExplorePostInput, index: number): string | null {
  const mediaUrls = opts.mediaUrls ?? [];
  const slideMeta = opts.mediaMeta?.[index];
  const mediaUrl = mediaUrls[index];
  if (shareSlideIsVideo(opts, index)) {
    return deliveredExploreVideoShareUrl({
      slide: slideMeta,
      mediaUrl,
      slideIndex: index,
      postPlaybackPath: opts.playbackPath,
    });
  }
  if (index === 0 && opts.displayUrl?.trim()) return opts.displayUrl;
  if (slideMeta?.display_path?.trim()) return slideMeta.display_path;
  const photoUrl = mediaUrl ?? null;
  if (photoUrl?.startsWith("https://")) return photoUrl;
  return null;
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
  const last = path.split("/").pop() ?? "";
  const ext = last.includes(".") ? last.split(".").pop() : undefined;
  const allowed = isVideo ? ["mp4", "mov", "m4v", "webm"] : ["jpg", "jpeg", "png", "webp", "gif"];
  if (ext && allowed.includes(ext)) return ext;
  return isVideo ? "mp4" : "jpg";
}

function mimeForMedia(isVideo: boolean, ext: string): string {
  if (isVideo) {
    if (ext === "mov") return "video/quicktime";
    if (ext === "webm") return "video/webm";
    if (ext === "m4v") return "video/x-m4v";
    return "video/mp4";
  }
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export type ShareExplorePostMediaFailureLabels = {
  title: string;
  body: string;
  cancel: string;
  shareLink: string;
};

/**
 * Share the post media file via the native share sheet (Instagram, WhatsApp, Save, etc.).
 * Falls back to link share when download fails.
 */
export async function shareExplorePostMedia(
  opts: ShareExplorePostInput,
  failureLabels?: ShareExplorePostMediaFailureLabels,
): Promise<void> {
  const index = opts.mediaIndex ?? 0;
  const mediaUrl = resolveShareMediaUrl(opts, index);
  if (!mediaUrl || !mediaUrl.startsWith("https://")) {
    await shareExplorePostLink(opts);
    return;
  }

  const isVideo = shareSlideIsVideo(opts, index);
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
      UTI: isVideo ? "public.movie" : ext === "png" ? "public.png" : "public.jpeg",
    });
  } catch {
    const title = failureLabels?.title ?? "Couldn't share media";
    const body =
      failureLabels?.body ??
      "We couldn't prepare this file for sharing. Try sharing the link instead.";
    Alert.alert(title, body, [
      { text: failureLabels?.cancel ?? "Cancel", style: "cancel" },
      {
        text: failureLabels?.shareLink ?? "Share link",
        onPress: () => void shareExplorePostLink(opts),
      },
    ]);
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
  onDismiss?: () => void,
): Promise<void> {
  const buttons = buildExploreShareActionButtons(opts, labels, Platform.OS);
  Alert.alert(
    labels.sheetTitle,
    undefined,
    buttons.map((b) => ({
      text: b.text,
      style: b.style,
      onPress: () => {
        onDismiss?.();
        if (b.action) void onAction(b.action);
      },
    })),
    { cancelable: true, onDismiss },
  );
}

export type ExploreShareActionButton = {
  text: string;
  action?: ExploreShareAction;
  style?: "cancel";
};

/**
 * Android `Alert` renders at most three buttons, so the explicit Cancel is dropped
 * there when media share is offered; the alert stays dismissible via back / outside tap.
 */
export function buildExploreShareActionButtons(
  opts: ShareExplorePostInput,
  labels: {
    shareLink: string;
    shareMedia: string;
    shareMediaVideo: string;
    copyLink: string;
    cancel: string;
  },
  platform: string,
): ExploreShareActionButton[] {
  const index = opts.mediaIndex ?? 0;
  const shareUrl = resolveShareMediaUrl(opts, index);
  const hasMedia = Boolean(shareUrl?.startsWith("https://"));
  const isVideo = hasMedia && shareSlideIsVideo(opts, index);

  const buttons: ExploreShareActionButton[] = [{ text: labels.shareLink, action: "link" }];
  if (hasMedia) {
    buttons.push({ text: isVideo ? labels.shareMediaVideo : labels.shareMedia, action: "media" });
  }
  buttons.push({ text: labels.copyLink, action: "copy" });
  if (platform !== "android" || buttons.length < 3) {
    buttons.push({ text: labels.cancel, style: "cancel" });
  }
  return buttons;
}
