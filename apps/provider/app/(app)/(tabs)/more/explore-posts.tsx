import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ExpoVideoPreview } from "@/components/ExpoVideoPreview";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { appendUploadFile } from "@/lib/form-data-file";
import { localUriSizeBytes, putLocalUriToSignedUrl } from "@/lib/explore-upload-uri";
import { Image, type ImageStyle as ExpoImageStyle } from "expo-image";
import { getWebProviderBaseUrl } from "@/lib/web-url";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { tabScreenScrollBottomPadding } from "@/constants/layout";
import {
  launchImageLibraryWithPermission,
  PERMISSION_COPY,
} from "@/lib/native-permissions";
import { useTranslation } from "@beautonomi/i18n";
import { ContentReportSheet, type ContentReportTargetType } from "@/components/safety/ContentReportSheet";
import { ExploreSlideOverlayComposer } from "@/components/explore/ExploreSlideOverlayComposer";
import {
  ExploreVideoTrimSheet,
  type ExploreVideoTrimResult,
} from "@/components/explore/ExploreVideoTrimSheet";
import {
  ExploreCameraCaptureSheet,
  type ExploreCameraCaptureResult,
} from "@/components/explore/ExploreCameraCaptureSheet";
import {
  ExploreSoundPicker,
  type ExploreSoundPickerItem,
  type ExploreSoundPickerLabels,
} from "@/components/explore/ExploreSoundPicker";
import { trimWindowDurationMs } from "@/lib/explore-video-trim";
import { useSocialCapability, useSafetySettings } from "@/hooks/useSafetySettings";
import { useUserBlocks } from "@/hooks/useUserBlocks";
import { useAuth } from "@/providers/AuthProvider";

type SlideTextOverlay = {
  text: string;
  x: number;
  y: number;
  font_size: number;
  color: string;
  align: "center";
};

interface ExplorePost {
  id: string;
  provider_id: string;
  provider: { business_name: string; slug: string };
  caption: string | null;
  media_urls: string[];
  display_url?: string | null;
  status: "draft" | "published";
  published_at: string;
  like_count: number;
  comment_count?: number;
  view_count?: number;
  primary_category_id?: string | null;
  tags?: string[];
  offering_id?: string | null;
  offering?: { id: string; name: string; price?: number; duration_minutes?: number } | null;
  created_at: string;
  updated_at: string;
  media_meta?: Array<{ kind?: string; text_overlays?: SlideTextOverlay[] }>;
}

interface GlobalCategory {
  id: string;
  slug: string;
  name: string;
}

interface ExploreComment {
  id: string;
  post_id: string;
  user_id: string;
  author: { id: string; full_name: string | null; avatar_url: string | null };
  body: string;
  created_at: string;
}

type MinePostsResponse = ExplorePost[] | {
  posts?: ExplorePost[];
  data?: ExplorePost[];
  pagination?: { has_more?: boolean };
  total?: number;
};

type ProviderPermissionsResponse = {
  permissions?: {
    create_explore_posts?: boolean;
  };
};

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0].split("#")[0];
  return lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov") || lower.endsWith(".m4v");
}

type PickedAsset = {
  uri: string;
  mimeType?: string;
  fileName?: string;
  isVideo?: boolean;
  fileSize?: number;
  /** Source file duration in ms (from picker or trim sheet). */
  source_duration_ms?: number;
  duration_ms?: number;
  trim_start_ms?: number;
  trim_end_ms?: number;
};

function isVideoAsset(asset: PickedAsset): boolean {
  return asset.isVideo === true || (asset.mimeType?.startsWith("video/") ?? false);
}

function splitPickedImageVideo(assets: PickedAsset[]) {
  const images: PickedAsset[] = [];
  const videos: PickedAsset[] = [];
  for (const a of assets) {
    if (isVideoAsset(a)) videos.push(a);
    else images.push(a);
  }
  return { images, videos };
}

function mapPickerAsset(a: {
  uri: string;
  type?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  duration?: number | null;
}): PickedAsset {
  const isVideo = a.type === "video" || a.type === "pairedVideo" || (a.mimeType?.startsWith("video/") ?? false);
  const durationSec = typeof a.duration === "number" && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : undefined;
  return {
    uri: a.uri,
    mimeType: a.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg"),
    fileName: a.fileName ?? (isVideo ? "video.mp4" : "image.jpg"),
    isVideo,
    fileSize: typeof (a as { fileSize?: number }).fileSize === "number" ? (a as { fileSize?: number }).fileSize : undefined,
    ...(durationSec != null ? { source_duration_ms: Math.round(durationSec * 1000) } : {}),
  };
}

type UploadSlotResult = {
  path?: string;
  display_path?: string;
  width?: number;
  height?: number;
  kind: "image" | "video";
  duration_ms?: number;
  source_duration_ms?: number;
  trim_start_ms?: number;
  trim_end_ms?: number;
  error?: string;
};

async function uploadExploreMediaAsset(asset: PickedAsset, index: number): Promise<UploadSlotResult> {
  const video = isVideoAsset(asset);
  const fallbackName =
    asset.fileName ?? (video ? `video-${index}.mp4` : `image-${index}.jpg`);
  const safeType = asset.mimeType ?? (video ? "video/mp4" : "image/jpeg");
  let sizeBytes = asset.fileSize ?? 0;
  if (sizeBytes <= 0) {
    const probed = await localUriSizeBytes(asset.uri);
    if (probed != null) sizeBytes = probed;
  }

  if (video) {
    const capsRes = await api.fetch<{ max_duration_ms?: number; max_video_bytes?: number }>(
      "/api/explore/upload",
      { method: "GET" },
    );
    const maxVideoBytes = capsRes.data?.max_video_bytes;
    if (maxVideoBytes != null && sizeBytes > maxVideoBytes) {
      return { kind: "video", error: "Video file is too large" };
    }
    const maxDurationMs = capsRes.data?.max_duration_ms ?? 60_000;
    const sourceDurationMs =
      asset.source_duration_ms != null && asset.source_duration_ms > 0
        ? asset.source_duration_ms
        : maxDurationMs;
    const segmentMs =
      asset.duration_ms != null && asset.duration_ms > 0
        ? asset.duration_ms
        : asset.trim_start_ms != null && asset.trim_end_ms != null
          ? trimWindowDurationMs({
              trim_start_ms: asset.trim_start_ms,
              trim_end_ms: asset.trim_end_ms,
            })
          : Math.min(sourceDurationMs, maxDurationMs);
    const slotRes = await api.fetch<{ path: string; signed_url?: string | null }>("/api/explore/upload", {
      method: "POST",
      body: {
        kind: "video",
        size_bytes: sizeBytes || undefined,
        mime_type: safeType,
        duration_ms: sourceDurationMs,
      },
    });
    if (slotRes.error || !slotRes.data?.path) {
      return { kind: "video", error: slotRes.error?.message ?? "Upload failed" };
    }
    if (slotRes.data.signed_url) {
      const ok = await putLocalUriToSignedUrl(asset.uri, slotRes.data.signed_url, safeType);
      if (!ok) return { kind: "video", error: "Video upload failed" };
    }
    return {
      path: slotRes.data.path,
      kind: "video",
      duration_ms: segmentMs,
      source_duration_ms: sourceDurationMs,
      trim_start_ms: asset.trim_start_ms ?? 0,
      trim_end_ms: asset.trim_end_ms ?? segmentMs,
    };
  }

  const capsRes = await api.fetch<{
    max_image_bytes?: number;
    max_multipart_image_bytes?: number;
  }>("/api/explore/upload", { method: "GET" });
  const maxMultipart =
    capsRes.data?.max_multipart_image_bytes ?? Math.floor(4.5 * 1024 * 1024);
  const maxImage = capsRes.data?.max_image_bytes ?? 15 * 1024 * 1024;

  if (sizeBytes > maxImage) {
    return { kind: "image", error: "Image file is too large" };
  }

  if (sizeBytes > maxMultipart) {
    const slotRes = await api.fetch<{ path: string; signed_url?: string | null }>("/api/explore/upload", {
      method: "POST",
      body: {
        kind: "image",
        size_bytes: sizeBytes,
        mime_type: safeType,
      },
    });
    if (slotRes.error || !slotRes.data?.path) {
      return { kind: "image", error: slotRes.error?.message ?? "Upload failed" };
    }
    if (slotRes.data.signed_url) {
      const ok = await putLocalUriToSignedUrl(asset.uri, slotRes.data.signed_url, safeType);
      if (!ok) return { kind: "image", error: "Image upload failed" };
    }
    const fin = await api.fetch<{ path: string; display_path: string; width: number; height: number }>(
      "/api/explore/upload/finalize",
      {
        method: "POST",
        body: { path: slotRes.data.path },
      },
    );
    if (fin.error || !fin.data?.path) {
      return { kind: "image", error: fin.error?.message ?? "Finalize failed" };
    }
    return {
      path: fin.data.path,
      display_path: fin.data.display_path,
      width: fin.data.width,
      height: fin.data.height,
      kind: "image",
    };
  }

  const formData = new FormData();
  await appendUploadFile(formData, "file", {
    uri: asset.uri,
    type: safeType,
    name: fallbackName,
  });
  const res = await api.fetch<{ path: string; display_path?: string; width?: number; height?: number }>(
    "/api/explore/upload",
    { method: "POST", body: formData },
  );
  if (res.error || !res.data?.path) {
    return { kind: "image", error: res.error?.message ?? "Upload failed" };
  }
  return {
    path: res.data.path,
    display_path: res.data.display_path,
    width: res.data.width,
    height: res.data.height,
    kind: "image",
  };
}

function mediaMetaFromUploads(slots: UploadSlotResult[]) {
  return slots.map((s) => ({
    kind: s.kind,
    display_path: s.display_path ?? null,
    width: s.width ?? null,
    height: s.height ?? null,
    ...(s.kind === "video"
      ? {
          duration_ms: s.duration_ms ?? null,
          source_duration_ms: s.source_duration_ms ?? null,
          trim_start_ms: s.trim_start_ms ?? null,
          trim_end_ms: s.trim_end_ms ?? null,
        }
      : {}),
  }));
}

const MAX_TEXT_OVERLAYS_PER_SLIDE = 8;

function overlayFromDraft(text: string): SlideTextOverlay | null {
  const trimmed = text.trim().slice(0, 80);
  if (!trimmed) return null;
  return { text: trimmed, x: 0.5, y: 0.5, font_size: 0.06, color: "#FFFFFF", align: "center" };
}

function applySlideOverlaysToMediaMeta<T extends Record<string, unknown>>(
  base: T[],
  overlaysByIndex: Record<number, SlideTextOverlay[]>,
): Array<T & { text_overlays?: SlideTextOverlay[] }> {
  return base.map((m, i) => {
    const layers = overlaysByIndex[i];
    return layers?.length ? { ...m, text_overlays: layers } : m;
  });
}

function overlaysFromPostMeta(meta: unknown[] | undefined): Record<number, SlideTextOverlay[]> {
  const map: Record<number, SlideTextOverlay[]> = {};
  if (!Array.isArray(meta)) return map;
  meta.forEach((row, i) => {
    const layers = (row as { text_overlays?: SlideTextOverlay[] })?.text_overlays;
    if (layers?.length) map[i] = layers;
  });
  return map;
}

function reindexSlideOverlaysAfterRemove(
  prev: Record<number, SlideTextOverlay[]>,
  removedIndex: number,
): Record<number, SlideTextOverlay[]> {
  const next: Record<number, SlideTextOverlay[]> = {};
  for (const key of Object.keys(prev)) {
    const i = Number(key);
    if (Number.isNaN(i) || i === removedIndex) continue;
    next[i > removedIndex ? i - 1 : i] = prev[i]!;
  }
  return next;
}

/** Arc showing the kept clip (trim start → end) around a library video preview. */
function LibraryClipRing({
  size,
  trimStartMs,
  trimEndMs,
  sourceMs,
}: {
  size: number;
  trimStartMs?: number;
  trimEndMs?: number;
  sourceMs?: number;
}) {
  const { t } = useTranslation();
  const stroke = Math.max(2, Math.round(size * 0.045));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const source = sourceMs && sourceMs > 0 ? sourceMs : trimEndMs && trimEndMs > 0 ? trimEndMs : 1;
  const start = Math.min(1, Math.max(0, (trimStartMs ?? 0) / source));
  const end = Math.min(1, Math.max(start, (trimEndMs ?? source) / source));
  const visible = Math.max(c * (end - start), stroke);
  return (
    <Svg
      width={size}
      height={size}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityLabel={t("provider.mobile.screens.explorePosts.clipWindowA11y")}
    >
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.35)" strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#ffffff"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${visible} ${c}`}
        strokeDashoffset={-c * start}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

/** Local file preview for create/edit strips — uses expo-video for video, expo-image for photos. */
function LocalMediaPreview({ asset, size }: { asset: PickedAsset; size: number }) {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const video = isVideoAsset(asset);
  if (video) {
    return (
      <View style={{ width: size, height: size, backgroundColor: "#111" }}>
        <ExpoVideoPreview
          uri={asset.uri}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          paused
          muted
        />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View
            style={[
              StyleSheet.absoluteFill,
              { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" },
            ]}
          >
            <Ionicons name="play-circle" size={Math.round(size * 0.42)} color="rgba(255,255,255,0.95)" />
          </View>
        </View>
        <LibraryClipRing
          size={size}
          trimStartMs={asset.trim_start_ms}
          trimEndMs={asset.trim_end_ms}
          sourceMs={asset.source_duration_ms}
        />
      </View>
    );
  }
  if (imageFailed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          backgroundColor: "#e5e7eb",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="image-outline" size={Math.round(size * 0.35)} color="#9ca3af" />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: asset.uri }}
      style={{ width: size, height: size, backgroundColor: "#f3f4f6" } as ExpoImageStyle}
      contentFit="cover"
      transition={200}
      recyclingKey={asset.uri}
      accessibilityLabel={t("provider.mobile.screens.explorePosts.selectedPhotoPreviewA11y")}
      onError={() => setImageFailed(true)}
    />
  );
}

function formatPublishedLine(
  post: ExplorePost,
  translate: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (post.status !== "published") return translate("draftNotOnExplore");
  if (typeof post.published_at === "string" && post.published_at) {
    try {
      const d = new Date(post.published_at);
      if (Number.isFinite(d.getTime())) {
        return translate("publishedAt", {
          when: d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
        });
      }
    } catch {
      /* ignore */
    }
  }
  return translate("published");
}

function explorePublicBase(): string {
  return getWebProviderBaseUrl().replace(/\/$/, "");
}

/** Square media preview for feed cards — video shows native preview via expo-video. */
function ExploreFeedMediaThumb({
  uri,
  height,
}: {
  uri: string;
  height: number;
}) {
  const { t } = useTranslation();
  const video = isVideoUrl(uri);
  if (!video) {
    return (
      <Image
        source={{ uri }}
        style={{ width: "100%", height, borderRadius: 0 } as ExpoImageStyle}
        contentFit="cover"
        accessibilityLabel={t("provider.mobile.screens.explorePosts.postImageA11y")}
      />
    );
  }
  return (
    <View style={{ width: "100%", height, backgroundColor: "#111" }}>
      <ExpoVideoPreview
        uri={uri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        paused
        muted
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" }]}>
          <Ionicons name="play-circle" size={52} color="rgba(255,255,255,0.95)" />
        </View>
      </View>
    </View>
  );
}

export default function ExplorePostsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, isTablet, screenPadding } = useResponsive();
  /** BottomSheet content uses paddingHorizontal: 20 — carousel must match or nested horizontal ScrollView gets zero height. */
  const exploreDetailSheetPadding = 20;
  const exploreDetailMediaWidth = Math.max(
    280,
    windowWidth - exploreDetailSheetPadding * 2,
  );
  /** Instagram-style grid: 3 on phone, 4 on tablet; thin gutters.
   *  ScreenContainer applies paddingHorizontal: screenPadding so we subtract
   *  both sides here — otherwise on tablet the 4th column overflows and clips. */
  const exploreGridGap = 2;
  const exploreGridColumns = isTablet ? 4 : 3;
  const exploreGridCellSize =
    (windowWidth - screenPadding * 2 - exploreGridGap * (exploreGridColumns - 1)) / exploreGridColumns;
  const params = useLocalSearchParams<{
    create?: string;
    offeringId?: string;
    caption?: string;
    addToGallery?: string;
    bookingId?: string;
    returnTo?: string;
    step?: string;
  }>();
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<PickedAsset[]>([]);
  const [soundId, setSoundId] = useState<string | null>(null);
  const [editSoundId, setEditSoundId] = useState<string | null>(null);
  const [providerSounds, setProviderSounds] = useState<ExploreSoundPickerItem[]>([]);
  const [soundCatalogEnabled, setSoundCatalogEnabled] = useState(false);
  const hasVideoInSelection = selectedAssets.some((a) => isVideoAsset(a));
  /** Customer full-screen player + sound bed require video as first slide. */
  const hasVideoFirstForSound = Boolean(selectedAssets[0] && isVideoAsset(selectedAssets[0]));
  const [caption, setCaption] = useState("");
  const [submittingMode, setSubmittingMode] = useState<"publish" | "draft" | null>(null);
  const [primaryCategorySlug, setPrimaryCategorySlug] = useState<string | null>(null);
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [alsoAddToGallery, setAlsoAddToGallery] = useState(true);
  const [preseedBookingId, setPreseedBookingId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [overlaySlideIndex, setOverlaySlideIndex] = useState(0);
  const [overlayDraft, setOverlayDraft] = useState("");
  const [slideOverlays, setSlideOverlays] = useState<Record<number, SlideTextOverlay[]>>({});
  const [editOverlaySlideIndex, setEditOverlaySlideIndex] = useState(0);
  const [editOverlayDraft, setEditOverlayDraft] = useState("");
  const [editSlideOverlays, setEditSlideOverlays] = useState<Record<number, SlideTextOverlay[]>>({});

  const [categories, setCategories] = useState<GlobalCategory[]>([]);
  const [offerings, setOfferings] = useState<{ id: string; title: string }[]>([]);
  const [viewPost, setViewPost] = useState<ExplorePost | null>(null);
  const [viewDetailMediaIndex, setViewDetailMediaIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editSubmittingMode, setEditSubmittingMode] = useState<"publish" | "draft" | null>(null);
  const [editPrimaryCategorySlug, setEditPrimaryCategorySlug] = useState<string | null>(null);
  const [editTagInput, setEditTagInput] = useState("");
  const [editOfferingId, setEditOfferingId] = useState<string | null>(null);
  /** Existing media URLs (from API); user can remove before save */
  const [editRemoteUrls, setEditRemoteUrls] = useState<string[]>([]);
  const [editRemoteMeta, setEditRemoteMeta] = useState<Record<string, unknown>[]>([]);
  /** New library/camera picks — uploaded on save */
  const [editLocalAssets, setEditLocalAssets] = useState<PickedAsset[]>([]);
  const [editUploading, setEditUploading] = useState(false);
  const [maxVideoClipMs, setMaxVideoClipMs] = useState(60_000);
  const [trimSheetAsset, setTrimSheetAsset] = useState<PickedAsset | null>(null);
  const [trimRemainder, setTrimRemainder] = useState<PickedAsset[]>([]);
  const [trimTarget, setTrimTarget] = useState<"create" | "edit">("create");
  const [cameraCaptureOpen, setCameraCaptureOpen] = useState(false);
  const [cameraCaptureTarget, setCameraCaptureTarget] = useState<"create" | "edit">("create");
  const [extraPosts, setExtraPosts] = useState<ExplorePost[]>([]);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: ContentReportTargetType;
    id: string;
    title: string;
  } | null>(null);

  const { t } = useTranslation();
  const ep = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.explorePosts.${key}`, opts) as string,
    [t],
  );
  const soundPickerLabels = useMemo<ExploreSoundPickerLabels>(
    () => ({
      addMusic: ep("addMusic"),
      originalAudio: ep("originalAudio"),
      viewerHint: ep("soundViewerHint"),
      soundsEmpty: ep("soundsEmpty"),
      sectionPlatform: ep("soundsSectionPlatform"),
      sectionYours: ep("soundsSectionYours"),
      previewPlay: ep("soundPreviewPlay"),
      previewStop: ep("soundPreviewStop"),
    }),
    [ep],
  );
  const { user } = useAuth();
  const { confirmBlockUser, isBlocked } = useUserBlocks();

  const { data, loading, error, refresh } = useApi<MinePostsResponse>("/api/explore/posts/mine?limit=100&offset=0");
  const { data: permissionData } = useApi<ProviderPermissionsResponse>("/api/provider/permissions");
  const { settings: safetySettings } = useSafetySettings();
  const ugcCreate = useSocialCapability("ugc_create");
  const commentCapability = useSocialCapability("comment");
  const hideSocialFeed = Boolean(safetySettings.hide_social_feed);
  const canCreateByStaffPermission = permissionData?.permissions?.create_explore_posts === true;
  const canCreateExplorePosts = canCreateByStaffPermission && ugcCreate.allowed;
  const canComment = commentCapability.allowed;
  const openControlsLabel = t("customer.safety.socialRestricted.openControls");
  const safetyControlsPath = "/(app)/(tabs)/more/settings/content-and-safety-controls" as const;

  const alertSafetyControls = useCallback(
    (body: string) => {
      Alert.alert(t("customer.accountSettings.contentSafetyTitle"), body, [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: openControlsLabel,
          onPress: () => router.push(safetyControlsPath as never),
        },
      ]);
    },
    [openControlsLabel, router, t],
  );

  const blockExploreUgcAction = useCallback(
    (permissionDeniedMessage: string): boolean => {
      if (!ugcCreate.allowed) {
        alertSafetyControls(t("customer.explorePost.safetyInteractionsOff"));
        return true;
      }
      if (!canCreateByStaffPermission) {
        Alert.alert(ep("permissionTitle"), permissionDeniedMessage);
        return true;
      }
      return false;
    },
    [alertSafetyControls, canCreateByStaffPermission, ep, t, ugcCreate.allowed],
  );
  const { execute: deletePost } = useApiMutation("delete");
  const { execute: createPost, loading: creating } = useApiMutation<ExplorePost>("post");
  const { execute: updatePost, loading: updating } = useApiMutation<ExplorePost>("patch");

  const commentsPath = viewPost ? `/api/explore/posts/${viewPost.id}/comments` : "";
  const { data: commentsResp, loading: commentsLoading, refresh: refreshComments } = useApi<{
    data: ExploreComment[];
  }>(commentsPath, { enabled: !!viewPost && !editMode });
  const { execute: postComment, loading: postingComment } = useApiMutation<ExploreComment>("post");

  const [commentBody, setCommentBody] = useState("");

  const openContentReport = useCallback(
    (type: ContentReportTargetType, id: string, title: string) => {
      setReportTarget({ type, id, title });
    },
    [],
  );

  const showPostSafetyMenu = useCallback(() => {
    if (!viewPost) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      t("customer.explorePost.moreOptions", { defaultValue: "Post options" }),
      undefined,
      [
        {
          text: t("customer.contentReport.reportPost"),
          style: "destructive",
          onPress: () =>
            openContentReport("explore_post", viewPost.id, t("customer.contentReport.reportPost")),
        },
        { text: t("common.cancel"), style: "cancel" },
      ],
    );
  }, [openContentReport, t, viewPost]);

  useEffect(() => {
    setViewDetailMediaIndex(0);
  }, [viewPost?.id]);

  const showCommentSafetyMenu = useCallback(
    (comment: ExploreComment) => {
      const authorId = comment.author?.id ?? comment.user_id;
      const authorName = comment.author?.full_name;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const actions: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [
        {
          text: t("customer.contentReport.reportComment", { defaultValue: "Report comment" }),
          style: "destructive",
          onPress: () =>
            openContentReport(
              "explore_comment",
              comment.id,
              t("customer.contentReport.reportComment", { defaultValue: "Report comment" }),
            ),
        },
      ];
      if (authorId && authorId !== user?.id && !isBlocked(authorId)) {
        actions.push({
          text: t("customer.blockUser.confirmAction"),
          style: "destructive",
          onPress: () =>
            confirmBlockUser({
              userId: authorId,
              displayName: authorName ?? undefined,
              onBlocked: () => refreshComments(),
            }),
        });
      }
      actions.push({ text: t("common.cancel"), style: "cancel" });
      Alert.alert(authorName ?? t("customer.blockUser.defaultName"), undefined, actions);
    },
    [confirmBlockUser, isBlocked, openContentReport, refreshComments, t, user?.id],
  );

  const firstPagePosts = useMemo(() => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.posts)) return data.posts;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  }, [data]);
  const posts = useMemo(() => [...firstPagePosts, ...extraPosts], [firstPagePosts, extraPosts]);

  const analyticsTotals = useMemo(() => {
    let views = 0;
    let likes = 0;
    for (const p of posts) {
      views += typeof p.view_count === "number" ? p.view_count : 0;
      likes += typeof p.like_count === "number" ? p.like_count : 0;
    }
    return { views, likes };
  }, [posts]);

  const canLoadMorePosts =
    !Array.isArray(data) &&
    (typeof data?.total === "number"
      ? posts.length < data.total
      : Boolean(data?.pagination?.has_more));
  const comments: ExploreComment[] = commentsResp?.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setExtraPosts([]);
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const loadMorePosts = useCallback(async () => {
    if (loadingMorePosts || !canLoadMorePosts) return;
    setLoadingMorePosts(true);
    try {
      const res = await api.get<MinePostsResponse>(`/api/explore/posts/mine?limit=100&offset=${posts.length}`);
      if (res.error) {
        Alert.alert(ep("loadMoreFailedTitle"), res.error.message ?? ep("tryAgain"));
        return;
      }
      const body = res.data;
      const next = Array.isArray(body) ? body : Array.isArray(body?.posts) ? body.posts : Array.isArray(body?.data) ? body.data : [];
      setExtraPosts((current) => [...current, ...next]);
    } finally {
      setLoadingMorePosts(false);
    }
  }, [canLoadMorePosts, ep, loadingMorePosts, posts.length]);

  useEffect(() => {
    api.get<GlobalCategory[] | { data: GlobalCategory[] }>("/api/public/categories/global").then((res) => {
      const body = res.data;
      const list = Array.isArray(body)
        ? body
        : body && typeof body === "object" && "data" in body && Array.isArray((body as { data: GlobalCategory[] }).data)
          ? (body as { data: GlobalCategory[] }).data
          : [];
      setCategories(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get<{ id: string; title?: string }[] | { data: { id: string; title?: string }[] }>("/api/provider/services")
      .then((res) => {
        const body = res.data;
        const raw = Array.isArray(body)
          ? body
          : body && typeof body === "object" && "data" in body && Array.isArray((body as { data: { id: string; title?: string }[] }).data)
            ? (body as { data: { id: string; title?: string }[] }).data
            : [];
        setOfferings(
          raw.map((o) => ({
            id: o.id,
            title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : ep("serviceFallback"),
          })),
        );
      })
      .catch(() => setOfferings([]));
  }, [ep]);

  useEffect(() => {
    if (params.create === "1" && canCreateExplorePosts) {
      // Pre-seed from the "post your work" completion flow (booking detail → this deep link).
      if (params.caption) setCaption(String(params.caption));
      if (params.offeringId) setOfferingId(String(params.offeringId));
      if (params.bookingId) setPreseedBookingId(String(params.bookingId));
      if (params.addToGallery != null) setAlsoAddToGallery(params.addToGallery === "1" || params.addToGallery === "true");
      setCreateOpen(true);
    }
  }, [params.create, params.caption, params.offeringId, params.bookingId, params.addToGallery, canCreateExplorePosts]);

  const diversityTip = useMemo(() => {
    if (posts.length < 3 || categories.length < 2) return null;
    const bySlug: Record<string, number> = {};
    for (const p of posts) {
      const slug = p.primary_category_id
        ? (categories.find((c) => c.id === p.primary_category_id)?.slug ?? "_none")
        : "_none";
      bySlug[slug] = (bySlug[slug] ?? 0) + 1;
    }
    const entries = Object.entries(bySlug).filter(([k]) => k !== "_none").sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return null;
    const [topSlug, topCount] = entries[0];
    if (topCount < posts.length * 0.5) return null;
    const topName = categories.find((c) => c.slug === topSlug)?.name ?? topSlug;
    const other = categories.find((c) => c.slug !== topSlug);
    if (!other) return null;
    return ep("diversityTip", { topName, otherName: other.name });
  }, [ep, posts, categories]);

  useEffect(() => {
    if (!editMode || !viewPost) return;
    setEditSlideOverlays(overlaysFromPostMeta(viewPost.media_meta as unknown[] | undefined));
    setEditOverlayDraft("");
    setEditOverlaySlideIndex(0);
  }, [editMode, viewPost?.id, viewPost?.media_meta]);

  const openView = useCallback((post: ExplorePost) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewPost(post);
    setEditMode(false);
    setEditCaption(post.caption ?? "");
    const cat = post.primary_category_id
      ? categories.find((c) => c.id === post.primary_category_id)
      : null;
    setEditPrimaryCategorySlug(cat?.slug ?? null);
    setEditTagInput(
      Array.isArray(post.tags) && post.tags.length ? post.tags.join(", ") : "",
    );
    setEditOfferingId(post.offering_id ?? null);
    setEditRemoteUrls([...(post.media_urls ?? [])]);
    setEditLocalAssets([]);
    setEditSoundId((post as ExplorePost & { sound_id?: string | null }).sound_id ?? null);
  }, [categories]);

  const handleDelete = useCallback(
    (post: ExplorePost) => {
      if (blockExploreUgcAction(ep("noPermissionManage"))) return;
      Alert.alert(
        ep("deletePostTitle"),
        ep("deletePostConfirm"),
        [
          { text: ep("cancel"), style: "cancel" },
          {
            text: ep("delete"),
            style: "destructive",
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const { error: err } = await deletePost(`/api/explore/posts/${post.id}`, {});
              if (err) {
                Alert.alert(ep("errorTitle"), err);
              } else {
                setViewPost(null);
                refresh();
              }
            },
          },
        ]
      );
    },
    [blockExploreUgcAction, deletePost, ep, refresh]
  );

  const editMediaSlotsLeft = 5 - editRemoteUrls.length - editLocalAssets.length;
  const hasVideoInEdit = useMemo(
    () => editRemoteUrls.some((url) => isVideoUrl(url)) || editLocalAssets.some((a) => isVideoAsset(a)),
    [editRemoteUrls, editLocalAssets],
  );
  const hasVideoFirstInEditForSound = useMemo(() => {
    if (editRemoteUrls.length > 0) return isVideoUrl(editRemoteUrls[0]);
    if (editLocalAssets.length > 0) return isVideoAsset(editLocalAssets[0]);
    return false;
  }, [editRemoteUrls, editLocalAssets]);

  const handleSaveEdit = useCallback(async (publish: boolean) => {
    if (!viewPost) return;
    if (blockExploreUgcAction(ep("noPermissionManage"))) return;
    if (trimSheetAsset) {
      Alert.alert(ep("trimVideoTitle"), ep("trimVideoFinishFirst"));
      return;
    }
    const totalMedia = editRemoteUrls.length + editLocalAssets.length;
    if (totalMedia === 0) {
      Alert.alert(ep("addMediaTitle"), ep("addMediaBody"));
      return;
    }
    if (totalMedia > 5) {
      Alert.alert(ep("tooManyMediaTitle"), ep("tooManyMediaBody"));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditSubmittingMode(publish ? "publish" : "draft");
    setEditUploading(true);
    try {
      const uploadSlots: UploadSlotResult[] = [];
      for (let i = 0; i < editLocalAssets.length; i++) {
        const asset = editLocalAssets[i];
        const res = await uploadExploreMediaAsset(asset, i);
        if (res.error || !res.path) {
          Alert.alert(ep("uploadFailedTitle"), res.error ?? ep("uploadFailedBody"));
          return;
        }
        uploadSlots.push(res);
      }
      const media_urls = [...editRemoteUrls, ...uploadSlots.map((s) => s.path!)];
      const media_meta = applySlideOverlaysToMediaMeta(
        [
          ...editRemoteUrls.map((url, i) => {
            const prev = editRemoteMeta[i];
            return (prev ?? { kind: isVideoUrl(url) ? "video" : "image" }) as Record<string, unknown>;
          }),
          ...mediaMetaFromUploads(uploadSlots),
        ],
        editSlideOverlays,
      );
      const tags = [
        ...new Set(
          editTagInput
            .split(/[,]+/)
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        ),
      ].slice(0, 20);

      const originalUrls = viewPost.media_urls ?? [];
      const mediaUrlsUnchanged =
        editLocalAssets.length === 0 &&
        editRemoteUrls.length === originalUrls.length &&
        editRemoteUrls.every((u, i) => u === originalUrls[i]);

      const payload: Record<string, unknown> = {
        caption: editCaption.trim() || null,
        status: publish ? "published" : "draft",
        primary_category_slug: editPrimaryCategorySlug ?? null,
        tags,
        offering_id: editOfferingId,
        ...(publish && alsoAddToGallery ? { also_add_to_gallery: true } : {}),
        ...(hasVideoFirstInEditForSound ? { sound_id: editSoundId } : { sound_id: null }),
      };
      if (mediaUrlsUnchanged) {
        payload.media_meta = media_meta;
      } else {
        payload.media_urls = media_urls;
        payload.media_meta = media_meta;
      }

      const { data: updated, error: err } = await updatePost(
        `/api/explore/posts/${viewPost.id}`,
        payload,
      );
      if (err) {
        Alert.alert(publish ? ep("couldntPublish") : ep("couldntSaveDraft"), err);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (updated) setViewPost(updated);
      setEditMode(false);
      setEditLocalAssets([]);
      refresh();
    } finally {
      setEditUploading(false);
      setEditSubmittingMode(null);
    }
  }, [
    viewPost,
    editCaption,
    editPrimaryCategorySlug,
    editTagInput,
    editOfferingId,
    editRemoteUrls,
    editRemoteMeta,
    editLocalAssets,
    editSlideOverlays,
    hasVideoInEdit,
    editSoundId,
    trimSheetAsset,
    updatePost,
    refresh,
    blockExploreUgcAction,
    alsoAddToGallery,
    ep,
  ]);

  useEffect(() => {
    if (!createOpen && !editMode && !trimSheetAsset) return;
    void api
      .fetch<{ max_duration_ms?: number; sound_catalog_enabled?: boolean }>("/api/explore/upload", {
        method: "GET",
      })
      .then((res) => {
        if (res.data?.max_duration_ms) setMaxVideoClipMs(res.data.max_duration_ms);
        setSoundCatalogEnabled(res.data?.sound_catalog_enabled === true);
      });
  }, [createOpen, editMode, trimSheetAsset]);

  const ingestNewAssets = useCallback(
    (target: "create" | "edit", incoming: PickedAsset[]) => {
      const room =
        target === "create"
          ? 5 - selectedAssets.length
          : 5 - editRemoteUrls.length - editLocalAssets.length;
      if (room <= 0) {
        Alert.alert(ep("limitReachedTitle"), ep("limitReachedBody"));
        return;
      }
      const batch = incoming.slice(0, room);
      const { images, videos } = splitPickedImageVideo(batch);
      if (target === "create") {
        if (images.length) setSelectedAssets((prev) => [...prev, ...images].slice(0, 5));
      } else if (images.length) {
        setEditLocalAssets((prev) => [...prev, ...images]);
      }
      if (videos.length) {
        setTrimTarget(target);
        if (trimSheetAsset) {
          setTrimRemainder((prev) => [...prev, ...videos]);
        } else {
          setTrimRemainder(videos.slice(1));
          setTrimSheetAsset(videos[0]!);
        }
      }
    },
    [selectedAssets.length, editRemoteUrls.length, editLocalAssets.length, trimSheetAsset, ep],
  );

  const confirmTrimSheet = useCallback(
    (result: ExploreVideoTrimResult) => {
      if (!trimSheetAsset) return;
      const trimmed: PickedAsset = {
        ...trimSheetAsset,
        source_duration_ms: result.source_duration_ms,
        trim_start_ms: result.trim_start_ms,
        trim_end_ms: result.trim_end_ms,
        duration_ms: trimWindowDurationMs(result),
      };
      if (trimTarget === "create") {
        setSelectedAssets((prev) => [...prev, trimmed].slice(0, 5));
      } else {
        setEditLocalAssets((prev) => [...prev, trimmed]);
      }
      if (trimRemainder.length > 0) {
        setTrimSheetAsset(trimRemainder[0]!);
        setTrimRemainder(trimRemainder.slice(1));
      } else {
        setTrimSheetAsset(null);
        setTrimRemainder([]);
      }
    },
    [trimSheetAsset, trimRemainder, trimTarget],
  );

  const cancelTrimSheet = useCallback(() => {
    if (trimRemainder.length > 0) {
      setTrimSheetAsset(trimRemainder[0]!);
      setTrimRemainder(trimRemainder.slice(1));
    } else {
      setTrimSheetAsset(null);
      setTrimRemainder([]);
    }
  }, [trimRemainder]);

  const mapCameraCaptureToAsset = useCallback((result: ExploreCameraCaptureResult): PickedAsset => {
    return {
      uri: result.uri,
      mimeType: result.mimeType,
      fileName: result.fileName,
      isVideo: result.isVideo,
      ...(result.source_duration_ms ? { source_duration_ms: result.source_duration_ms } : {}),
    };
  }, []);

  const onCameraCapture = useCallback(
    (result: ExploreCameraCaptureResult) => {
      setCameraCaptureOpen(false);
      ingestNewAssets(cameraCaptureTarget, [mapCameraCaptureToAsset(result)]);
    },
    [cameraCaptureTarget, ingestNewAssets, mapCameraCaptureToAsset],
  );

  const openCameraCapture = useCallback(
    (target: "create" | "edit") => {
      if (trimSheetAsset) {
        Alert.alert(ep("trimVideoTitle"), ep("trimVideoFinishFirst"));
        return;
      }
      setCameraCaptureTarget(target);
      setCameraCaptureOpen(true);
    },
    [trimSheetAsset, ep],
  );

  const pickMediaForEdit = useCallback(async () => {
    if (trimSheetAsset) {
      Alert.alert(ep("trimVideoTitle"), ep("trimVideoFinishFirst"));
      return;
    }
    const result = await launchImageLibraryWithPermission(
      {
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        quality: 0.9,
      },
      PERMISSION_COPY.photosPost,
    );
    if (!result) return;
    if (result.canceled) return;
    const newAssets: PickedAsset[] = result.assets.map((a) => mapPickerAsset(a));
    ingestNewAssets("edit", newAssets);
  }, [ingestNewAssets, trimSheetAsset, ep]);

  const pickFromCameraForEdit = useCallback(() => {
    openCameraCapture("edit");
  }, [openCameraCapture]);

  const removeEditRemote = useCallback((index: number) => {
    setEditRemoteUrls((prev) => prev.filter((_, i) => i !== index));
    setEditRemoteMeta((prev) => prev.filter((_, i) => i !== index));
    setEditSlideOverlays((prev) => reindexSlideOverlaysAfterRemove(prev, index));
    setEditOverlaySlideIndex((prev) => (prev > index ? prev - 1 : prev === index ? Math.max(0, prev - 1) : prev));
  }, []);

  const removeEditLocal = useCallback(
    (index: number) => {
      const removedSlideIndex = editRemoteUrls.length + index;
      setEditLocalAssets((prev) => prev.filter((_, i) => i !== index));
      setEditSlideOverlays((prev) => reindexSlideOverlaysAfterRemove(prev, removedSlideIndex));
      setEditOverlaySlideIndex((prev) =>
        prev > removedSlideIndex ? prev - 1 : prev === removedSlideIndex ? Math.max(0, prev - 1) : prev,
      );
    },
    [editRemoteUrls.length],
  );

  const resetCreateForm = useCallback(() => {
    setSelectedAssets([]);
    setCaption("");
    setSubmittingMode(null);
    setPrimaryCategorySlug(null);
    setOfferingId(null);
    setAlsoAddToGallery(true);
    setPreseedBookingId(null);
    setTagInput("");
    setSoundId(null);
    setOverlayDraft("");
    setSlideOverlays({});
    setOverlaySlideIndex(0);
    setTrimSheetAsset(null);
    setTrimRemainder([]);
    setCameraCaptureOpen(false);
  }, []);

  useEffect(() => {
    const needsSounds =
      soundCatalogEnabled &&
      ((createOpen && hasVideoFirstForSound) || (editMode && hasVideoFirstInEditForSound));
    if (!needsSounds) {
      if (!hasVideoFirstForSound) setSoundId(null);
      return;
    }
    void api.get<{ data: ExploreSoundPickerItem[] }>("/api/explore/sounds/mine").then((res) => {
      const raw = (res.data as { data?: unknown })?.data ?? res.data;
      const list = Array.isArray(raw) ? raw : Array.isArray((raw as { data?: unknown })?.data) ? (raw as { data: ExploreSoundPickerItem[] }).data : [];
      setProviderSounds(list as ExploreSoundPickerItem[]);
    }).catch(() => setProviderSounds([]));
  }, [hasVideoFirstForSound, hasVideoFirstInEditForSound, createOpen, editMode, soundCatalogEnabled]);

  const openCreate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetCreateForm();
    setCreateOpen(true);
  }, [resetCreateForm]);

  const closeCreate = useCallback(() => {
    if (uploading || creating || trimSheetAsset) return;
    resetCreateForm();
    setCreateOpen(false);
  }, [uploading, creating, resetCreateForm, trimSheetAsset]);

  const pickMedia = useCallback(async () => {
    if (trimSheetAsset) {
      Alert.alert(ep("trimVideoTitle"), ep("trimVideoFinishFirst"));
      return;
    }
    const result = await launchImageLibraryWithPermission(
      {
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        quality: 0.9,
      },
      PERMISSION_COPY.photosPost,
    );
    if (!result) return;
    if (result.canceled) return;
    const newAssets: PickedAsset[] = result.assets.map((a) => mapPickerAsset(a));
    ingestNewAssets("create", newAssets);
  }, [ingestNewAssets, trimSheetAsset, ep]);

  const pickFromCamera = useCallback(() => {
    openCameraCapture("create");
  }, [openCameraCapture]);

  const removeAsset = useCallback((index: number) => {
    setSelectedAssets((prev) => prev.filter((_, i) => i !== index));
    setSlideOverlays((prev) => reindexSlideOverlaysAfterRemove(prev, index));
    setOverlaySlideIndex((prev) => (prev > index ? prev - 1 : prev === index ? Math.max(0, prev - 1) : prev));
  }, []);

  const submitPost = useCallback(async (publish: boolean) => {
    if (blockExploreUgcAction(ep("noPermissionCreate"))) return;
    if (trimSheetAsset) {
      Alert.alert(ep("trimVideoTitle"), ep("trimVideoFinishFirst"));
      return;
    }
    if (selectedAssets.length === 0) {
      Alert.alert(ep("addMediaTitle"), ep("addMediaBody"));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmittingMode(publish ? "publish" : "draft");
    setUploading(true);
    const uploadSlots: UploadSlotResult[] = [];
    try {
      for (let i = 0; i < selectedAssets.length; i++) {
        const asset = selectedAssets[i];
        const res = await uploadExploreMediaAsset(asset, i);
        if (res.error || !res.path) {
          Alert.alert(
            ep("uploadFailedTitle"),
            ep("uploadFailedItem", {
              message: res.error ?? ep("uploadFailedBody"),
              current: i + 1,
              total: selectedAssets.length,
            }),
          );
          setUploading(false);
          setSubmittingMode(null);
          return;
        }
        uploadSlots.push(res);
      }
      const paths = uploadSlots.map((s) => s.path!);
      const media_meta = applySlideOverlaysToMediaMeta(mediaMetaFromUploads(uploadSlots), slideOverlays);
      const tags = [...new Set(tagInput.split(/[,]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(
        0,
        20,
      );
      const { error: createErr } = await createPost("/api/explore/posts", {
        caption: caption.trim() || null,
        media_urls: paths,
        media_meta,
        status: publish ? "published" : "draft",
        ...(primaryCategorySlug ? { primary_category_slug: primaryCategorySlug } : {}),
        ...(tags.length ? { tags } : {}),
        ...(offeringId ? { offering_id: offeringId } : {}),
        ...(alsoAddToGallery ? { also_add_to_gallery: true } : {}),
        ...(hasVideoFirstForSound && soundId ? { sound_id: soundId } : {}),
        ...(preseedBookingId ? { booking_id: preseedBookingId } : {}),
      });
      setUploading(false);
      setSubmittingMode(null);
      if (createErr) {
        Alert.alert(
          publish ? ep("couldntPublish") : ep("couldntSaveDraft"),
          createErr,
        );
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetCreateForm();
      setCreateOpen(false);
      refresh();
      const returnBookingId = params.bookingId || preseedBookingId;
      if (publish && params.returnTo === "booking" && returnBookingId) {
        router.replace(
          `/(app)/(tabs)/more/bookings/${returnBookingId}?step=rate` as never,
        );
        return;
      }
    } catch (e) {
      setUploading(false);
      setSubmittingMode(null);
      Alert.alert(
        publish ? ep("couldntPublish") : ep("couldntSaveDraft"),
        e instanceof Error ? e.message : ep("somethingWentWrong"),
      );
    }
  }, [blockExploreUgcAction, trimSheetAsset, selectedAssets, caption, primaryCategorySlug, offeringId, alsoAddToGallery, hasVideoInSelection, soundId, preseedBookingId, params.bookingId, params.returnTo, tagInput, slideOverlays, createPost, refresh, resetCreateForm, router, ep]);

  const openCreateIfAllowed = useCallback(() => {
    if (blockExploreUgcAction(ep("noPermissionCreate"))) return;
    openCreate();
  }, [blockExploreUgcAction, ep, openCreate]);

  const createHeaderAction = canCreateExplorePosts ? (
    <TouchableOpacity
      onPress={openCreateIfAllowed}
      style={twStyle("h-11 w-11 items-center justify-center rounded-full bg-[#ec4899] shadow-sm")}
      accessibilityLabel={ep("createPostA11y")}
      accessibilityRole="button"
      hitSlop={6}
    >
      <Ionicons name="add" size={26} color="#fff" />
    </TouchableOpacity>
  ) : undefined;

  const openExploreFeed = useCallback(() => {
    const url = `${explorePublicBase()}/explore`;
    pushInAppBrowser(router, url, ep("exploreBrowserTitle"));
  }, [ep, router]);

  const openPublicPost = useCallback(
    (postId: string) => {
      const url = `${explorePublicBase()}/explore/${postId}`;
      pushInAppBrowser(router, url, ep("publicPostBrowserTitle"));
    },
    [ep, router],
  );

  const renderExploreGridItem = useCallback(
    ({ item: post, index }: { item: ExplorePost; index: number }) => {
      const thumb = post.display_url ?? post.media_urls?.[0];
      const col = index % exploreGridColumns;
      return (
        <TouchableOpacity
          onPress={() => openView(post)}
          activeOpacity={0.85}
          style={{
            width: exploreGridCellSize,
            height: exploreGridCellSize,
            marginEnd: col === exploreGridColumns - 1 ? 0 : exploreGridGap,
            marginBottom: exploreGridGap,
            overflow: "hidden",
            backgroundColor: "#f3f4f6",
          }}
          accessibilityRole="button"
          accessibilityLabel={
            post.caption ? ep("gridPostA11y", { caption: post.caption.slice(0, 80) }) : ep("gridPostFallbackA11y")
          }
        >
          {thumb ? (
            <ExploreFeedMediaThumb uri={thumb} height={exploreGridCellSize} />
          ) : (
            <View style={twStyle("h-full w-full items-center justify-center")}>
              <Ionicons name="image-outline" size={28} color="#d1d5db" />
            </View>
          )}
          {post.status !== "published" ? (
            <View
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                backgroundColor: "rgba(0,0,0,0.55)",
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
              }}
              pointerEvents="none"
            >
              <Text style={{ fontSize: 10, fontWeight: "600", color: "#fff" }}>{ep("draftBadge")}</Text>
            </View>
          ) : null}
          {(post.media_urls?.length ?? 0) > 1 ? (
            <View style={{ position: "absolute", top: 6, right: 6 }} pointerEvents="none">
              <Ionicons name="layers-outline" size={18} color="rgba(255,255,255,0.95)" />
            </View>
          ) : null}
        </TouchableOpacity>
      );
    },
    [
      ep,
      exploreGridCellSize,
      exploreGridColumns,
      exploreGridGap,
      openView,
    ],
  );

  const exploreListHeader = useMemo(() => {
    if (posts.length === 0) return null;
    return (
      <>
        <View style={twStyle("mb-3 mt-1 flex-row flex-wrap items-center gap-2 rounded-xl bg-pink-50 p-3")}>
          <Ionicons name="gift-outline" size={20} color="#be185d" />
          <Text style={twStyle("min-w-[48%] flex-1 text-sm text-pink-900")}>
            {ep("rewardsBanner")}
          </Text>
          <TouchableOpacity
            onPress={openCreateIfAllowed}
            style={twStyle("rounded-lg bg-pink-600 px-3 py-2")}
            accessibilityLabel={ep("createNewPostA11y")}
            accessibilityRole="button"
          >
            <Text style={twStyle("text-xs font-semibold text-white")}>{ep("postNow")}</Text>
          </TouchableOpacity>
        </View>
        <View
          style={twStyle("mb-4 flex-row flex-wrap items-center gap-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4")}
        >
          <View style={twStyle("me-6 flex-row items-center gap-2")}>
            <Ionicons name="eye-outline" size={20} color="#6b7280" />
            <Text style={twStyle("text-sm text-gray-600")}>{ep("totalViews")}</Text>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>{analyticsTotals.views}</Text>
          </View>
          <View style={twStyle("me-6 flex-row items-center gap-2")}>
            <Ionicons name="heart-outline" size={20} color="#6b7280" />
            <Text style={twStyle("text-sm text-gray-600")}>{ep("totalLikes")}</Text>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>{analyticsTotals.likes}</Text>
          </View>
          <TouchableOpacity
            onPress={openExploreFeed}
            style={twStyle("ms-auto flex-row items-center gap-1")}
            accessibilityRole="button"
            accessibilityLabel={ep("openExploreFeedA11y")}
          >
            <Ionicons name="open-outline" size={18} color="#db2777" />
            <Text style={twStyle("text-sm font-semibold text-[#db2777]")}>{ep("viewExplore")}</Text>
          </TouchableOpacity>
        </View>
        <Text style={twStyle("mb-2 px-1 text-xs font-medium uppercase tracking-wide text-gray-500")}>
          {ep("yourPosts")}
        </Text>
      </>
    );
  }, [
    posts.length,
    analyticsTotals.views,
    analyticsTotals.likes,
    openCreateIfAllowed,
    openExploreFeed,
    ep,
  ]);

  const exploreListFooter = useMemo(() => {
    if (!canLoadMorePosts) return null;
    return (
      <TouchableOpacity
        onPress={() => void loadMorePosts()}
        disabled={loadingMorePosts}
        style={twStyle("mt-2 items-center rounded-xl border border-gray-200 bg-white px-4 py-3")}
        accessibilityRole="button"
        accessibilityLabel={ep("loadMoreA11y")}
      >
        {loadingMorePosts ? (
          <ActivityIndicator color="#ec4899" />
        ) : (
          <Text style={twStyle("text-sm font-semibold text-[#ec4899]")}>{ep("loadMore")}</Text>
        )}
      </TouchableOpacity>
    );
  }, [canLoadMorePosts, ep, loadMorePosts, loadingMorePosts]);

  const handleEndReachedExplore = useCallback(() => {
    if (!canLoadMorePosts || loadingMorePosts) return;
    void loadMorePosts();
  }, [canLoadMorePosts, loadingMorePosts, loadMorePosts]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader
          title={ep("title")}
          showBack
          subtitle={ep("subtitle")}
          rightAction={createHeaderAction}
        />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader
          title={ep("title")}
          showBack
          subtitle={ep("subtitle")}
          rightAction={createHeaderAction}
        />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const scrollBottomPad = tabScreenScrollBottomPadding(insets.bottom, 24) + 64;

  if (hideSocialFeed) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={ep("title")} showBack subtitle={ep("subtitle")} />
        <View style={twStyle("flex-1 justify-center px-6")}>
          <EmptyState
            icon="eye-off-outline"
            title={ep("socialHiddenTitle")}
            description={ep("socialHiddenBody")}
          />
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/settings/content-and-safety-controls" as never)}
            style={twStyle("mt-4 self-center")}
            accessibilityRole="button"
          >
            <Text style={twStyle("text-sm font-semibold text-primary")}>
              {t("customer.safety.socialRestricted.openControls")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <ScreenHeader title={ep("title")} showBack subtitle={ep("subtitle")} rightAction={createHeaderAction} />

        <FlatList
          key={`explore-grid-${exploreGridColumns}`}
          style={twStyle("flex-1")}
          data={posts}
          numColumns={exploreGridColumns}
          keyExtractor={(item: ExplorePost) => item.id}
          renderItem={renderExploreGridItem}
          ListHeaderComponent={exploreListHeader ?? undefined}
          ListFooterComponent={exploreListFooter ?? undefined}
          ListEmptyComponent={
            <EmptyState
              icon="camera-outline"
              title={ep("emptyTitle")}
              description={ep("emptyBody")}
              actionLabel={ep("emptyAction")}
              onAction={openCreate}
            />
          }
          contentContainerStyle={{
            paddingBottom: scrollBottomPad,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReachedExplore}
          onEndReachedThreshold={0.35}
          initialNumToRender={18}
          windowSize={7}
        />

        <TouchableOpacity
          onPress={openCreateIfAllowed}
          style={{
            position: "absolute",
            right: 12,
            bottom: tabScreenScrollBottomPadding(insets.bottom, 8),
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#ec4899",
            alignItems: "center",
            justifyContent: "center",
            elevation: 6,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.22,
            shadowRadius: 5,
          }}
          accessibilityLabel={ep("createPostA11y")}
          accessibilityRole="button"
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      </View>

      <BottomSheet
        visible={createOpen}
        onClose={closeCreate}
        title={ep("newPostTitle")}
        subtitle={ep("newPostSubtitle")}
      >
        <View style={twStyle("mb-4 flex-row gap-2")}>
          <TouchableOpacity
            onPress={pickMedia}
            disabled={!!trimSheetAsset}
            style={twStyle(
              `flex-1 flex-row items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-5 px-2 ${trimSheetAsset ? "opacity-50" : ""}`,
            )}
          >
            <Ionicons name="images-outline" size={24} color="#9ca3af" />
            <Text style={twStyle("ms-2 text-center text-xs font-medium text-gray-600")}>
              {selectedAssets.length > 0 ? ep("libraryCount", { count: selectedAssets.length }) : ep("library")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pickFromCamera}
            disabled={!!trimSheetAsset}
            style={twStyle(
              `flex-1 flex-row items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-5 px-2 ${trimSheetAsset ? "opacity-50" : ""}`,
            )}
          >
            <Ionicons name="camera-outline" size={24} color="#9ca3af" />
            <Text style={twStyle("ms-2 text-center text-xs font-medium text-gray-600")}>{ep("camera")}</Text>
          </TouchableOpacity>
        </View>
        {selectedAssets.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={twStyle("-mx-1 mb-4")}
          >
            {selectedAssets.map((asset, i) => (
              <TouchableOpacity
                key={`${asset.uri}-${i}`}
                activeOpacity={0.85}
                onPress={() => setOverlaySlideIndex(i)}
                style={twStyle(
                  `me-2 h-20 w-20 overflow-hidden rounded-lg bg-gray-100 ${overlaySlideIndex === i ? "border-2 border-violet-600" : ""}`,
                )}
              >
                <LocalMediaPreview asset={asset} size={80} />
                {(slideOverlays[i]?.length ?? 0) > 0 ? (
                  <View style={twStyle("absolute bottom-1 left-1 rounded bg-violet-600 px-1")}>
                    <Text style={twStyle("text-[10px] font-medium text-white")}>Aa</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  onPress={() => removeAsset(i)}
                  style={twStyle("absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60")}
                  accessibilityLabel={ep("removeMediaA11y")}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
        {selectedAssets.length > 0 ? (
          <View style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-800")}>{ep("onMediaText")}</Text>
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>{ep("onMediaTextHint")}</Text>
            <View style={twStyle("flex-row items-end gap-2")}>
              <TextInput
                style={twStyle("min-h-[44px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900")}
                placeholder={ep("onMediaTextPlaceholder")}
                placeholderTextColor="#9ca3af"
                value={overlayDraft}
                onChangeText={setOverlayDraft}
              />
              <TouchableOpacity
                onPress={() => {
                  const layer = overlayFromDraft(overlayDraft);
                  if (!layer) return;
                  const idx = Math.min(overlaySlideIndex, selectedAssets.length - 1);
                  setSlideOverlays((prev) => {
                    const cur = prev[idx] ?? [];
                    if (cur.length >= MAX_TEXT_OVERLAYS_PER_SLIDE) return prev;
                    return { ...prev, [idx]: [...cur, layer] };
                  });
                  setOverlayDraft("");
                }}
                style={twStyle("rounded-lg bg-violet-600 px-4 py-3")}
              >
                <Text style={twStyle("text-sm font-medium text-white")}>{ep("addTextLayer")}</Text>
              </TouchableOpacity>
            </View>
            {(slideOverlays[overlaySlideIndex]?.length ?? 0) > 0 && selectedAssets[overlaySlideIndex] ? (
              <ExploreSlideOverlayComposer
                dragHint={ep("onMediaTextDragHint")}
                preview={
                  <LocalMediaPreview asset={selectedAssets[overlaySlideIndex]!} size={280} />
                }
                overlays={slideOverlays[overlaySlideIndex] ?? []}
                onChangeOverlays={(layers) =>
                  setSlideOverlays((prev) => ({ ...prev, [overlaySlideIndex]: layers }))
                }
              />
            ) : null}
          </View>
        ) : null}
        {diversityTip ? (
          <View style={twStyle("mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3")}>
            <Text style={twStyle("text-sm text-amber-900")}>{diversityTip}</Text>
          </View>
        ) : null}
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ep("captionOptional")}</Text>
        <TextInput
          style={twStyle("mb-4 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          placeholder={ep("captionPlaceholder")}
          placeholderTextColor="#9ca3af"
          value={caption}
          onChangeText={setCaption}
          multiline
        />
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ep("tagsOptional")}</Text>
        <TextInput
          style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          placeholder={ep("tagsPlaceholder")}
          placeholderTextColor="#9ca3af"
          value={tagInput}
          onChangeText={setTagInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {offerings.length > 0 ? (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ep("linkService")}</Text>
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>
              {ep("linkServiceHint")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-4 -mx-1")}>
              <TouchableOpacity
                onPress={() => setOfferingId(null)}
                style={[twStyle("rounded-full px-4 py-2 me-2"), offeringId === null ? twStyle("bg-violet-600") : twStyle("bg-gray-100")]}
              >
                <Text style={twStyle(offeringId === null ? "text-white text-sm font-medium" : "text-gray-600 text-sm")}>
                  {ep("none")}
                </Text>
              </TouchableOpacity>
              {offerings.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => setOfferingId(o.id)}
                  style={[
                    twStyle("rounded-full px-4 py-2 me-2 max-w-[200px]"),
                    offeringId === o.id ? twStyle("bg-violet-600") : twStyle("bg-gray-100"),
                  ]}
                >
                  <Text
                    style={twStyle(offeringId === o.id ? "text-white text-sm font-medium" : "text-gray-600 text-sm")}
                    numberOfLines={1}
                  >
                    {o.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}
        {categories.length > 0 ? (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ep("categoryOptional")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-4 -mx-1")}>
              <TouchableOpacity
                onPress={() => setPrimaryCategorySlug(null)}
                style={[twStyle("rounded-full px-4 py-2 me-2"), primaryCategorySlug === null ? twStyle("bg-indigo-600") : twStyle("bg-gray-100")]}
              >
                <Text style={twStyle(primaryCategorySlug === null ? "text-white text-sm font-medium" : "text-gray-600 text-sm")}>{ep("none")}</Text>
              </TouchableOpacity>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setPrimaryCategorySlug(c.slug)}
                  style={[twStyle("rounded-full px-4 py-2 me-2"), primaryCategorySlug === c.slug ? twStyle("bg-indigo-600") : twStyle("bg-gray-100")]}
                >
                  <Text style={twStyle(primaryCategorySlug === c.slug ? "text-white text-sm font-medium" : "text-gray-600 text-sm")}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}
        {hasVideoFirstForSound && soundCatalogEnabled ? (
          <ExploreSoundPicker
            sounds={providerSounds}
            value={soundId}
            onChange={setSoundId}
            disabled={uploading || submittingMode !== null}
            labels={soundPickerLabels}
          />
        ) : null}
        <TouchableOpacity
          onPress={() => setAlsoAddToGallery((v) => !v)}
          style={twStyle("mb-4 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
          activeOpacity={0.8}
        >
          <View style={twStyle("flex-1 pe-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-800")}>{ep("alsoAddToPortfolio")}</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              {ep("alsoAddToPortfolioHint")}
            </Text>
          </View>
          <View
            style={twStyle(
              `h-6 w-11 rounded-full ${alsoAddToGallery ? "bg-violet-600" : "bg-gray-300"} items-${alsoAddToGallery ? "end" : "start"} justify-center px-0.5`,
            )}
          >
            <View style={twStyle("h-5 w-5 rounded-full bg-white shadow-sm")} />
          </View>
        </TouchableOpacity>
        <View style={twStyle("mb-2 flex-row gap-3")}>
          <View style={twStyle("flex-1")}>
            <ActionButton
              label={
                (uploading || creating) && submittingMode === "publish"
                  ? ep("publishing")
                  : ep("publish")
              }
              onPress={() => void submitPost(true)}
              loading={(uploading || creating) && submittingMode === "publish"}
              disabled={!!trimSheetAsset || ((uploading || creating) && submittingMode !== "publish")}
              fullWidth
            />
          </View>
          <View style={twStyle("flex-1")}>
            <ActionButton
              label={
                (uploading || creating) && submittingMode === "draft"
                  ? ep("saving")
                  : ep("saveDraft")
              }
              onPress={() => void submitPost(false)}
              loading={(uploading || creating) && submittingMode === "draft"}
              disabled={!!trimSheetAsset || ((uploading || creating) && submittingMode !== "draft")}
              variant="secondary"
              fullWidth
            />
          </View>
        </View>
        <Text style={twStyle("text-center text-xs text-gray-500")}>
          {ep("publishHint")}
        </Text>
      </BottomSheet>

      {viewPost && (
        <BottomSheet
          visible={!!viewPost}
          onClose={() => !updating && !editUploading && setViewPost(null)}
          title={editMode ? ep("editPostTitle") : ep("postTitle")}
          snapHeight="full"
          subtitle={
            editMode
              ? undefined
              : ep("postStats", {
                  likes: viewPost.like_count,
                  comments: viewPost.comment_count ?? 0,
                  views: typeof viewPost.view_count === "number" ? viewPost.view_count : 0,
                })
          }
        >
          {editMode ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={twStyle("pb-2")}
            >
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ep("photosAndVideos")}</Text>
              <Text style={twStyle("mb-3 text-xs text-gray-500")}>
                {ep("editMediaHint")}
              </Text>
              <View style={twStyle("mb-3 flex-row gap-2")}>
                <TouchableOpacity
                  onPress={pickMediaForEdit}
                  disabled={editMediaSlotsLeft <= 0 || editUploading || !!trimSheetAsset}
                  style={twStyle(
                    `flex-1 flex-row items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-4 px-2 ${editMediaSlotsLeft <= 0 || trimSheetAsset ? "opacity-50" : ""}`,
                  )}
                >
                  <Ionicons name="images-outline" size={22} color="#9ca3af" />
                  <Text style={twStyle("ms-2 text-center text-xs font-medium text-gray-600")}>{ep("library")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={pickFromCameraForEdit}
                  disabled={editMediaSlotsLeft <= 0 || editUploading || !!trimSheetAsset}
                  style={twStyle(
                    `flex-1 flex-row items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-4 px-2 ${editMediaSlotsLeft <= 0 || trimSheetAsset ? "opacity-50" : ""}`,
                  )}
                >
                  <Ionicons name="camera-outline" size={22} color="#9ca3af" />
                  <Text style={twStyle("ms-2 text-center text-xs font-medium text-gray-600")}>{ep("camera")}</Text>
                </TouchableOpacity>
              </View>
              <Text style={twStyle("mb-2 text-xs text-gray-500")}>
                {ep("selectedCount", { count: editRemoteUrls.length + editLocalAssets.length })}
              </Text>
              {editRemoteUrls.length + editLocalAssets.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={twStyle("-mx-1 mb-4")}
                >
                  {editRemoteUrls.map((url, i) => {
                    const remoteMeta = editRemoteMeta[i] as
                      | {
                          trim_start_ms?: number | null;
                          trim_end_ms?: number | null;
                          source_duration_ms?: number | null;
                          duration_ms?: number | null;
                        }
                      | undefined;
                    return (
                    <TouchableOpacity
                      key={`r-${url}-${i}`}
                      activeOpacity={0.85}
                      onPress={() => setEditOverlaySlideIndex(i)}
                      style={twStyle(
                        `me-2 h-20 w-20 overflow-hidden rounded-lg bg-gray-100 ${editOverlaySlideIndex === i ? "border-2 border-violet-600" : ""}`,
                      )}
                    >
                      {isVideoUrl(url) ? (
                        <View style={twStyle("h-full w-full")}>
                          <ExploreFeedMediaThumb uri={url} height={80} />
                          <LibraryClipRing
                            size={80}
                            trimStartMs={remoteMeta?.trim_start_ms ?? undefined}
                            trimEndMs={remoteMeta?.trim_end_ms ?? undefined}
                            sourceMs={remoteMeta?.source_duration_ms ?? remoteMeta?.duration_ms ?? undefined}
                          />
                        </View>
                      ) : (
                        <Image
                          source={{ uri: url }}
                          style={twStyle("h-full w-full") as ExpoImageStyle}
                          contentFit="cover"
                        />
                      )}
                      {(editSlideOverlays[i]?.length ?? 0) > 0 ? (
                        <View style={twStyle("absolute bottom-1 left-1 rounded bg-violet-600 px-1")}>
                          <Text style={twStyle("text-[10px] font-medium text-white")}>Aa</Text>
                        </View>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => removeEditRemote(i)}
                        style={twStyle("absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60")}
                        accessibilityLabel={ep("removeMediaA11y")}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                    );
                  })}
                  {editLocalAssets.map((asset, i) => {
                    const slideIdx = editRemoteUrls.length + i;
                    return (
                      <TouchableOpacity
                        key={`l-${asset.uri}-${i}`}
                        activeOpacity={0.85}
                        onPress={() => setEditOverlaySlideIndex(slideIdx)}
                        style={twStyle(
                          `me-2 h-20 w-20 overflow-hidden rounded-lg bg-gray-100 ${editOverlaySlideIndex === slideIdx ? "border-2 border-violet-600" : ""}`,
                        )}
                      >
                        <LocalMediaPreview asset={asset} size={80} />
                        {(editSlideOverlays[slideIdx]?.length ?? 0) > 0 ? (
                          <View style={twStyle("absolute bottom-1 left-1 rounded bg-violet-600 px-1")}>
                            <Text style={twStyle("text-[10px] font-medium text-white")}>Aa</Text>
                          </View>
                        ) : null}
                        <TouchableOpacity
                          onPress={() => removeEditLocal(i)}
                          style={twStyle("absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60")}
                          accessibilityLabel={ep("removeNewUploadA11y")}
                        >
                          <Ionicons name="close" size={14} color="#fff" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : null}

              {editRemoteUrls.length + editLocalAssets.length > 0 ? (
                <View style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
                  <Text style={twStyle("mb-1 text-sm font-medium text-gray-800")}>{ep("onMediaText")}</Text>
                  <Text style={twStyle("mb-2 text-xs text-gray-500")}>{ep("onMediaTextHint")}</Text>
                  <View style={twStyle("flex-row items-end gap-2")}>
                    <TextInput
                      style={twStyle("min-h-[44px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900")}
                      placeholder={ep("onMediaTextPlaceholder")}
                      placeholderTextColor="#9ca3af"
                      value={editOverlayDraft}
                      onChangeText={setEditOverlayDraft}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        const layer = overlayFromDraft(editOverlayDraft);
                        if (!layer) return;
                        const total = editRemoteUrls.length + editLocalAssets.length;
                        const idx = Math.min(editOverlaySlideIndex, total - 1);
                        setEditSlideOverlays((prev) => {
                          const cur = prev[idx] ?? [];
                          if (cur.length >= MAX_TEXT_OVERLAYS_PER_SLIDE) return prev;
                          return { ...prev, [idx]: [...cur, layer] };
                        });
                        setEditOverlayDraft("");
                      }}
                      style={twStyle("rounded-lg bg-violet-600 px-4 py-3")}
                    >
                      <Text style={twStyle("text-sm font-medium text-white")}>{ep("addTextLayer")}</Text>
                    </TouchableOpacity>
                  </View>
                  {(() => {
                    const idx = Math.min(
                      editOverlaySlideIndex,
                      editRemoteUrls.length + editLocalAssets.length - 1,
                    );
                    const layers = editSlideOverlays[idx] ?? [];
                    if (!layers.length) return null;
                    const preview =
                      idx < editRemoteUrls.length ? (
                        isVideoUrl(editRemoteUrls[idx]!) ? (
                          <View style={{ width: 280, height: 280 }}>
                            <ExploreFeedMediaThumb uri={editRemoteUrls[idx]!} height={280} />
                          </View>
                        ) : (
                          <Image
                            source={{ uri: editRemoteUrls[idx]! }}
                            style={{ width: 280, height: 280 } as ExpoImageStyle}
                            contentFit="cover"
                          />
                        )
                      ) : editLocalAssets[idx - editRemoteUrls.length] ? (
                        <LocalMediaPreview
                          asset={editLocalAssets[idx - editRemoteUrls.length]!}
                          size={280}
                        />
                      ) : null;
                    if (!preview) return null;
                    return (
                      <ExploreSlideOverlayComposer
                        dragHint={ep("onMediaTextDragHint")}
                        preview={preview}
                        overlays={layers}
                        onChangeOverlays={(next) =>
                          setEditSlideOverlays((prev) => ({ ...prev, [idx]: next }))
                        }
                      />
                    );
                  })()}
                </View>
              ) : null}

              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ep("caption")}</Text>
              <TextInput
                style={twStyle("mb-4 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                placeholder={ep("captionPlaceholder")}
                placeholderTextColor="#9ca3af"
                value={editCaption}
                onChangeText={setEditCaption}
                multiline
              />
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ep("tagsOptional")}</Text>
              <TextInput
                style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                placeholder={ep("tagsPlaceholder")}
                placeholderTextColor="#9ca3af"
                value={editTagInput}
                onChangeText={setEditTagInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {offerings.length > 0 ? (
                <>
                  <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ep("linkService")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-4 -mx-1")}>
                    <TouchableOpacity
                      onPress={() => setEditOfferingId(null)}
                      style={[
                        twStyle("me-2 rounded-full px-4 py-2"),
                        editOfferingId === null ? twStyle("bg-violet-600") : twStyle("bg-gray-100"),
                      ]}
                    >
                      <Text
                        style={twStyle(
                          editOfferingId === null ? "text-sm font-medium text-white" : "text-sm text-gray-600",
                        )}
                      >
                        {ep("none")}
                      </Text>
                    </TouchableOpacity>
                    {offerings.map((o) => (
                      <TouchableOpacity
                        key={o.id}
                        onPress={() => setEditOfferingId(o.id)}
                        style={[
                          twStyle("me-2 max-w-[200px] rounded-full px-4 py-2"),
                          editOfferingId === o.id ? twStyle("bg-violet-600") : twStyle("bg-gray-100"),
                        ]}
                      >
                        <Text
                          style={twStyle(
                            editOfferingId === o.id ? "text-sm font-medium text-white" : "text-sm text-gray-600",
                          )}
                          numberOfLines={1}
                        >
                          {o.title}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : null}
              {categories.length > 0 ? (
                <>
                  <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ep("category")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-4 -mx-1")}>
                    <TouchableOpacity
                      onPress={() => setEditPrimaryCategorySlug(null)}
                      style={[
                        twStyle("me-2 rounded-full px-4 py-2"),
                        editPrimaryCategorySlug === null ? twStyle("bg-indigo-600") : twStyle("bg-gray-100"),
                      ]}
                    >
                      <Text
                        style={twStyle(
                          editPrimaryCategorySlug === null ? "text-sm font-medium text-white" : "text-sm text-gray-600",
                        )}
                      >
                        {ep("none")}
                      </Text>
                    </TouchableOpacity>
                    {categories.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setEditPrimaryCategorySlug(c.slug)}
                        style={[
                          twStyle("me-2 rounded-full px-4 py-2"),
                          editPrimaryCategorySlug === c.slug ? twStyle("bg-indigo-600") : twStyle("bg-gray-100"),
                        ]}
                      >
                        <Text
                          style={twStyle(
                            editPrimaryCategorySlug === c.slug ? "text-sm font-medium text-white" : "text-sm text-gray-600",
                          )}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : null}
              {hasVideoFirstInEditForSound && soundCatalogEnabled ? (
                <ExploreSoundPicker
                  sounds={providerSounds}
                  value={editSoundId}
                  onChange={setEditSoundId}
                  disabled={editUploading || editSubmittingMode !== null}
                  labels={soundPickerLabels}
                />
              ) : null}
              {hasVideoInEdit ? (
                <TouchableOpacity
                  onPress={() => setAlsoAddToGallery((v) => !v)}
                  style={twStyle("mb-4 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
                  activeOpacity={0.8}
                >
                  <View style={twStyle("flex-1 pe-3")}>
                    <Text style={twStyle("text-sm font-medium text-gray-800")}>{ep("alsoAddToPortfolio")}</Text>
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{ep("alsoAddToPortfolioHint")}</Text>
                  </View>
                  <View
                    style={twStyle(
                      `h-6 w-11 rounded-full ${alsoAddToGallery ? "bg-violet-600" : "bg-gray-300"} items-${alsoAddToGallery ? "end" : "start"} justify-center px-0.5`,
                    )}
                  >
                    <View style={twStyle("h-5 w-5 rounded-full bg-white shadow-sm")} />
                  </View>
                </TouchableOpacity>
              ) : null}
              <View style={twStyle("mb-2 flex-row gap-3")}>
                <View style={twStyle("flex-1")}>
                  <ActionButton
                    label={
                      (editUploading || updating) && editSubmittingMode === "publish"
                        ? ep("publishing")
                        : ep("publish")
                    }
                    onPress={() => void handleSaveEdit(true)}
                    loading={(editUploading || updating) && editSubmittingMode === "publish"}
                    disabled={!!trimSheetAsset || ((editUploading || updating) && editSubmittingMode !== "publish")}
                    fullWidth
                  />
                </View>
                <View style={twStyle("flex-1")}>
                  <ActionButton
                    label={
                      (editUploading || updating) && editSubmittingMode === "draft"
                        ? ep("saving")
                        : ep("saveDraft")
                    }
                    onPress={() => void handleSaveEdit(false)}
                    loading={(editUploading || updating) && editSubmittingMode === "draft"}
                    disabled={!!trimSheetAsset || ((editUploading || updating) && editSubmittingMode !== "draft")}
                    variant="secondary"
                    fullWidth
                  />
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setEditMode(false);
                  setEditLocalAssets([]);
                  setEditSubmittingMode(null);
                  if (viewPost) {
                    setEditRemoteUrls([...(viewPost.media_urls ?? [])]);
                    setEditTagInput(
                      Array.isArray(viewPost.tags) && viewPost.tags.length ? viewPost.tags.join(", ") : "",
                    );
                    setEditOfferingId(viewPost.offering_id ?? null);
                  }
                }}
                style={twStyle("mt-2 rounded-xl border border-gray-300 py-3")}
              >
                <Text style={twStyle("text-center text-sm font-medium text-gray-700")}>{ep("cancel")}</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <>
              {(() => {
                const urls = viewPost.media_urls ?? [];
                const pageW = exploreDetailMediaWidth;
                if (urls.length === 0) return null;
                return (
                  <View
                    key={`explore-detail-media-${viewPost.id}`}
                    style={{
                      marginBottom: 16,
                      width: pageW,
                      alignSelf: "center",
                    }}
                  >
                    {/*
                      Nested horizontal ScrollView must have an explicit height; otherwise
                      aspectRatio children do not lay out and images appear blank (RN).
                      Still images use the same ExploreFeedMediaThumb as the grid — expo-image
                      with h-full/w-full inside nested ScrollViews often gets zero layout here.
                    */}
                    <ScrollView
                      horizontal
                      nestedScrollEnabled
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      style={{ width: pageW, height: pageW }}
                      onMomentumScrollEnd={(e) => {
                        setViewDetailMediaIndex(Math.round(e.nativeEvent.contentOffset.x / pageW));
                      }}
                    >
                      {urls.map((url, idx) => (
                        <View key={`${url}-${idx}`} style={{ width: pageW, height: pageW }}>
                          <View
                            style={{
                              width: pageW,
                              height: pageW,
                              borderRadius: 12,
                              overflow: "hidden",
                              backgroundColor: "#111111",
                            }}
                          >
                            {isVideoUrl(url) ? (
                              <ExpoVideoPreview
                                uri={url}
                                style={{ width: pageW, height: pageW }}
                                contentFit="contain"
                                nativeControls
                                loop
                                paused={viewDetailMediaIndex !== idx}
                              />
                            ) : (
                              <ExploreFeedMediaThumb
                                uri={url}
                                height={pageW}
                              />
                            )}
                            {urls.length > 1 ? (
                              <View
                                style={{
                                  position: "absolute",
                                  bottom: 10,
                                  alignSelf: "center",
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                  backgroundColor: "rgba(0,0,0,0.5)",
                                }}
                                pointerEvents="none"
                              >
                                <Text style={twStyle("text-xs font-medium text-white")}>
                                  {ep("mediaPage", { current: idx + 1, total: urls.length })}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                );
              })()}
              <Text style={twStyle("mb-2 text-xs text-gray-500")}>{formatPublishedLine(viewPost, ep)}</Text>
              {viewPost.primary_category_id ? (
                <View style={twStyle("mb-3 flex-row flex-wrap")}>
                  <View style={twStyle("rounded-full bg-indigo-50 px-2.5 py-1")}>
                    <Text style={twStyle("text-xs font-medium text-indigo-800")}>
                      {categories.find((c) => c.id === viewPost.primary_category_id)?.name ?? ep("category")}
                    </Text>
                  </View>
                </View>
              ) : null}
              {Array.isArray(viewPost.tags) && viewPost.tags.length > 0 ? (
                <View style={twStyle("mb-3 flex-row flex-wrap gap-1")}>
                  {viewPost.tags.map((t) => (
                    <View key={t} style={twStyle("rounded-full bg-gray-100 px-2 py-1")}>
                      <Text style={twStyle("text-xs font-medium text-gray-700")}>#{t}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {viewPost.offering?.name ? (
                <View style={twStyle("mb-3 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-700")}>
                    {ep("linkedService")}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-sm font-medium text-violet-900")}>{viewPost.offering.name}</Text>
                  {typeof viewPost.offering.price === "number" ? (
                    <Text style={twStyle("text-xs text-violet-700")}>{ep("linkedServiceHint")}</Text>
                  ) : null}
                </View>
              ) : null}
              <Text style={twStyle("mb-3 text-sm leading-5 text-gray-700")}>
                {viewPost.caption || ep("noCaption")}
              </Text>
              {!editMode ? (
                <TouchableOpacity
                  onPress={showPostSafetyMenu}
                  style={twStyle("mb-4 flex-row items-center self-start rounded-lg border border-gray-200 bg-white px-3 py-2")}
                  accessibilityRole="button"
                  accessibilityLabel={t("customer.contentReport.reportPost")}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color="#6b7280" />
                  <Text style={twStyle("ms-2 text-sm font-medium text-gray-700")}>
                    {t("customer.explorePost.moreOptions", { defaultValue: "Post options" })}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <View style={twStyle("mb-4 flex-row flex-wrap items-center gap-x-3 gap-y-2")}>
                <View
                  style={[twStyle(`rounded-full px-2.5 py-1 ${viewPost.status === "published" ? "bg-green-100" : "bg-gray-100"}`)]}
                >
                  <Text
                    style={twStyle(`text-xs font-medium ${viewPost.status === "published" ? "text-green-800" : "text-gray-600"}`)}
                  >
                    {viewPost.status === "published" ? ep("statusPublished") : ep("statusDraft")}
                  </Text>
                </View>
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="heart-outline" size={16} color="#6b7280" />
                  <Text style={twStyle("text-xs text-gray-600")}>{viewPost.like_count ?? 0}</Text>
                </View>
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="chatbubble-outline" size={16} color="#6b7280" />
                  <Text style={twStyle("text-xs text-gray-600")}>{viewPost.comment_count ?? 0}</Text>
                </View>
                <View style={twStyle("flex-row items-center gap-1")}>
                  <Ionicons name="eye-outline" size={16} color="#6b7280" />
                  <Text style={twStyle("text-xs text-gray-600")}>
                    {typeof viewPost.view_count === "number" ? viewPost.view_count : 0}
                  </Text>
                </View>
              </View>
              {viewPost.status === "published" ? (
                <TouchableOpacity
                  onPress={() => openPublicPost(viewPost.id)}
                  style={twStyle("mb-4 flex-row items-center justify-center rounded-xl border border-pink-200 bg-pink-50 py-3")}
                  accessibilityRole="button"
                  accessibilityLabel={ep("viewOnExploreA11y")}
                >
                  <Ionicons name="open-outline" size={18} color="#db2777" />
                  <Text style={twStyle("ms-2 text-sm font-semibold text-[#db2777]")}>{ep("viewOnExplore")}</Text>
                </TouchableOpacity>
              ) : null}
              {canCreateExplorePosts ? (
                <View style={twStyle("mb-4 flex-row gap-2")}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditCaption(viewPost.caption ?? "");
                      const cat = viewPost.primary_category_id
                        ? categories.find((c) => c.id === viewPost.primary_category_id)
                        : null;
                      setEditPrimaryCategorySlug(cat?.slug ?? null);
                      setEditTagInput(
                        Array.isArray(viewPost.tags) && viewPost.tags.length
                          ? viewPost.tags.join(", ")
                          : "",
                      );
                      setEditOfferingId(viewPost.offering_id ?? null);
                      setEditRemoteUrls([...(viewPost.media_urls ?? [])]);
                      setEditRemoteMeta(
                        Array.isArray(viewPost.media_meta)
                          ? (viewPost.media_meta as Record<string, unknown>[]).map((row) => ({ ...row }))
                          : [],
                      );
                      setEditLocalAssets([]);
                      setEditMode(true);
                    }}
                    style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-3")}
                  >
                    <Ionicons name="pencil-outline" size={18} color="#6366f1" />
                    <Text style={twStyle("ms-1.5 text-sm font-medium text-indigo-600")}>{ep("edit")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => viewPost && handleDelete(viewPost)}
                    style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-red-200 bg-red-50 py-3")}
                  >
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    <Text style={twStyle("ms-1.5 text-sm font-medium text-red-600")}>{ep("delete")}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{ep("comments")}</Text>
              {commentsLoading ? (
                <Text style={twStyle("mb-3 text-sm text-gray-500")}>{ep("loadingComments")}</Text>
              ) : comments.length === 0 ? (
                <Text style={twStyle("mb-3 text-sm text-gray-500")}>{ep("noComments")}</Text>
              ) : (
                <ScrollView style={twStyle("mb-3 max-h-40")} nestedScrollEnabled>
                  {comments.map((c) => (
                    <View key={c.id} style={twStyle("mb-2 flex-row items-start rounded-lg bg-gray-50 px-3 py-2")}>
                      <View style={twStyle("flex-1")}>
                        <Text style={twStyle("text-xs font-medium text-gray-700")}>
                          {c.author?.full_name ?? ep("someone")}
                        </Text>
                        <Text style={twStyle("text-sm text-gray-900")}>{c.body}</Text>
                        <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                          {formatDateSafe(c.created_at)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => showCommentSafetyMenu(c)}
                        style={twStyle("ms-2 p-1")}
                        accessibilityRole="button"
                        accessibilityLabel={t("customer.explorePost.moreOptions", { defaultValue: "Comment options" })}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color="#9ca3af" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
              <View style={twStyle("flex-row items-end")}>
                {canComment ? (
                <>
                <TextInput
                  style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-base text-gray-900"), { marginEnd: 8 }]}
                  placeholder={ep("commentPlaceholder")}
                  placeholderTextColor="#9ca3af"
                  value={commentBody}
                  onChangeText={(t) => setCommentBody(t.slice(0, 200))}
                  maxLength={200}
                  multiline
                />
                <TouchableOpacity
                  onPress={async () => {
                    const body = commentBody.trim();
                    if (!body || !viewPost || postingComment) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const { error: err } = await postComment(
                      `/api/explore/posts/${viewPost.id}/comments`,
                      { body }
                    );
                    if (err) {
                      Alert.alert(ep("errorTitle"), err);
                    } else {
                      setCommentBody("");
                      refreshComments();
                      refresh();
                    }
                  }}
                  disabled={!commentBody.trim() || postingComment}
                  style={twStyle("rounded-xl bg-indigo-600 px-4 py-2.5")}
                >
                  <Text style={twStyle("text-sm font-medium text-white")}>
                    {postingComment ? ep("posting") : ep("postAction")}
                  </Text>
                </TouchableOpacity>
                </>
                ) : (
                  <View style={twStyle("flex-1 py-2")}>
                    <Text style={twStyle("text-sm text-gray-600 text-center leading-5")}>
                      {t("customer.explorePost.safetyInteractionsOff")}
                    </Text>
                    <TouchableOpacity
                      onPress={() => router.push(safetyControlsPath as never)}
                      style={twStyle("mt-2 self-center")}
                      accessibilityRole="button"
                    >
                      <Text style={twStyle("text-sm font-semibold text-primary")}>{openControlsLabel}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              {commentBody.length > 0 && (
                <Text style={twStyle("mt-1 text-xs text-gray-500")}>{ep("commentLength", { count: commentBody.length })}</Text>
              )}
            </>
          )}
        </BottomSheet>
      )}
      {reportTarget ? (
        <ContentReportSheet
          visible
          onClose={() => setReportTarget(null)}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          title={reportTarget.title}
        />
      ) : null}
      {trimSheetAsset ? (
        <ExploreVideoTrimSheet
          visible
          videoUri={trimSheetAsset.uri}
          fullDurationMs={trimSheetAsset.source_duration_ms ?? 0}
          maxClipMs={maxVideoClipMs}
          onConfirm={confirmTrimSheet}
          onCancel={cancelTrimSheet}
        />
      ) : null}
      <ExploreCameraCaptureSheet
        visible={cameraCaptureOpen}
        maxVideoDurationMs={maxVideoClipMs}
        onClose={() => setCameraCaptureOpen(false)}
        onCapture={onCameraCapture}
      />
    </ScreenContainer>
  );
}
