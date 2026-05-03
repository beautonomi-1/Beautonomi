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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Video, ResizeMode } from "expo-av";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
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
import { appendFormDataFileNative } from "@beautonomi/utils";
import { Image, type ImageStyle as ExpoImageStyle } from "expo-image";
import { getWebProviderBaseUrl } from "@/lib/web-url";
import { pushInAppBrowser } from "@/lib/in-app-web";
import { tabScreenScrollBottomPadding } from "@/constants/layout";

interface ExplorePost {
  id: string;
  provider_id: string;
  provider: { business_name: string; slug: string };
  caption: string | null;
  media_urls: string[];
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

function formatPublishedLine(post: ExplorePost): string {
  if (post.status !== "published") return "Draft — not on Explore yet";
  if (typeof post.published_at === "string" && post.published_at) {
    try {
      const d = new Date(post.published_at);
      if (Number.isFinite(d.getTime())) {
        return `Published ${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
      }
    } catch {
      /* ignore */
    }
  }
  return "Published";
}

function explorePublicBase(): string {
  return getWebProviderBaseUrl().replace(/\/$/, "");
}

/** Square media preview for feed cards — video shows native preview via expo-av. */
function ExploreFeedMediaThumb({
  uri,
  height,
}: {
  uri: string;
  height: number;
}) {
  const video = isVideoUrl(uri);
  if (!video) {
    return (
      <Image
        source={{ uri }}
        style={{ width: "100%", height, borderRadius: 0 } as ExpoImageStyle}
        contentFit="cover"
        accessibilityLabel="Post image"
      />
    );
  }
  return (
    <View style={{ width: "100%", height, backgroundColor: "#111" }}>
      <Video
        source={{ uri }}
        style={StyleSheet.absoluteFillObject}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isMuted
        useNativeControls={false}
      />
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.25)" }]}>
          <Ionicons name="play-circle" size={52} color="rgba(255,255,255,0.95)" />
        </View>
      </View>
    </View>
  );
}

type PickedAsset = { uri: string; mimeType?: string; fileName?: string };

export default function ExplorePostsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, isTablet } = useResponsive();
  /** BottomSheet content uses paddingHorizontal: 20 — carousel must match or nested horizontal ScrollView gets zero height. */
  const exploreDetailSheetPadding = 20;
  const exploreDetailMediaWidth = Math.max(
    280,
    windowWidth - exploreDetailSheetPadding * 2,
  );
  /** Instagram-style grid: 3 on phone, 4 on tablet; thin gutters */
  const exploreGridGap = 2;
  const exploreGridColumns = isTablet ? 4 : 3;
  const exploreGridCellSize =
    (windowWidth - exploreGridGap * (exploreGridColumns - 1)) / exploreGridColumns;
  const params = useLocalSearchParams<{ create?: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<PickedAsset[]>([]);
  const [caption, setCaption] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [primaryCategorySlug, setPrimaryCategorySlug] = useState<string | null>(null);
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);

  const [categories, setCategories] = useState<GlobalCategory[]>([]);
  const [offerings, setOfferings] = useState<{ id: string; title: string }[]>([]);
  const [viewPost, setViewPost] = useState<ExplorePost | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editPublishNow, setEditPublishNow] = useState(true);
  const [editPrimaryCategorySlug, setEditPrimaryCategorySlug] = useState<string | null>(null);
  const [editTagInput, setEditTagInput] = useState("");
  const [editOfferingId, setEditOfferingId] = useState<string | null>(null);
  /** Existing media URLs (from API); user can remove before save */
  const [editRemoteUrls, setEditRemoteUrls] = useState<string[]>([]);
  /** New library/camera picks — uploaded on save */
  const [editLocalAssets, setEditLocalAssets] = useState<PickedAsset[]>([]);
  const [editUploading, setEditUploading] = useState(false);
  const [extraPosts, setExtraPosts] = useState<ExplorePost[]>([]);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);

  const { data, loading, error, refresh } = useApi<MinePostsResponse>("/api/explore/posts/mine?limit=100&offset=0");
  const { data: permissionData } = useApi<ProviderPermissionsResponse>("/api/provider/permissions");
  const canCreateExplorePosts = permissionData?.permissions?.create_explore_posts === true;
  const { execute: deletePost } = useApiMutation("delete");
  const { execute: createPost, loading: creating } = useApiMutation<ExplorePost>("post");
  const { execute: updatePost, loading: updating } = useApiMutation<ExplorePost>("patch");

  const commentsPath = viewPost ? `/api/explore/posts/${viewPost.id}/comments` : "";
  const { data: commentsResp, loading: commentsLoading, refresh: refreshComments } = useApi<{
    data: ExploreComment[];
  }>(commentsPath, { enabled: !!viewPost && !editMode });
  const { execute: postComment, loading: postingComment } = useApiMutation<ExploreComment>("post");

  const [commentBody, setCommentBody] = useState("");

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
        Alert.alert("Could not load more", res.error.message ?? "Please try again.");
        return;
      }
      const body = res.data;
      const next = Array.isArray(body) ? body : Array.isArray(body?.posts) ? body.posts : Array.isArray(body?.data) ? body.data : [];
      setExtraPosts((current) => [...current, ...next]);
    } finally {
      setLoadingMorePosts(false);
    }
  }, [canLoadMorePosts, loadingMorePosts, posts.length]);

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
            title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Service",
          })),
        );
      })
      .catch(() => setOfferings([]));
  }, []);

  useEffect(() => {
    if (params.create === "1" && canCreateExplorePosts) setCreateOpen(true);
  }, [params.create, canCreateExplorePosts]);

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
    return `You often post in ${topName}. Try adding a ${other.name} post to reach more customers.`;
  }, [posts, categories]);

  const openView = useCallback((post: ExplorePost) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewPost(post);
    setEditMode(false);
    setEditCaption(post.caption ?? "");
    setEditPublishNow(post.status === "published");
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
  }, [categories]);

  const handleDelete = useCallback(
    (post: ExplorePost) => {
      if (!canCreateExplorePosts) {
        Alert.alert("Permission", "You do not have permission to manage Explore posts.");
        return;
      }
      Alert.alert(
        "Delete post",
        "Are you sure you want to delete this post?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const { error: err } = await deletePost(`/api/explore/posts/${post.id}`, {});
              if (err) {
                Alert.alert("Error", err);
              } else {
                setViewPost(null);
                refresh();
              }
            },
          },
        ]
      );
    },
    [canCreateExplorePosts, deletePost, refresh]
  );

  const editMediaSlotsLeft = 5 - editRemoteUrls.length - editLocalAssets.length;

  const handleSaveEdit = useCallback(async () => {
    if (!viewPost) return;
    if (!canCreateExplorePosts) {
      Alert.alert("Permission", "You do not have permission to manage Explore posts.");
      return;
    }
    const totalMedia = editRemoteUrls.length + editLocalAssets.length;
    if (totalMedia === 0) {
      Alert.alert("Add media", "Select at least one photo or video.");
      return;
    }
    if (totalMedia > 5) {
      Alert.alert("Too many media", "Explore posts can include up to 5 photos or videos.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditUploading(true);
    try {
      const uploadedPaths: string[] = [];
      for (const asset of editLocalAssets) {
        const formData = new FormData();
        appendFormDataFileNative(formData, "file", {
          uri: asset.uri,
          type: asset.mimeType ?? "image/jpeg",
          name: asset.fileName ?? "image.jpg",
        });
        const res = await api.fetch<{ path: string }>("/api/explore/upload", {
          method: "POST",
          body: formData,
        });
        if (res.error || !res.data?.path) {
          Alert.alert("Upload failed", res.error?.message ?? "Could not upload file.");
          return;
        }
        uploadedPaths.push(res.data.path);
      }
      const media_urls = [...editRemoteUrls, ...uploadedPaths];
      const tags = [
        ...new Set(
          editTagInput
            .split(/[,]+/)
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        ),
      ].slice(0, 20);

      const payload: Record<string, unknown> = {
        caption: editCaption.trim() || null,
        status: editPublishNow ? "published" : "draft",
        primary_category_slug: editPrimaryCategorySlug ?? null,
        tags,
        media_urls,
        offering_id: editOfferingId,
      };

      const { data: updated, error: err } = await updatePost(
        `/api/explore/posts/${viewPost.id}`,
        payload,
      );
      if (err) {
        Alert.alert("Error", err);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (updated) setViewPost(updated);
      setEditMode(false);
      setEditLocalAssets([]);
      refresh();
    } finally {
      setEditUploading(false);
    }
  }, [
    viewPost,
    editCaption,
    editPublishNow,
    editPrimaryCategorySlug,
    editTagInput,
    editOfferingId,
    editRemoteUrls,
    editLocalAssets,
    updatePost,
    refresh,
    canCreateExplorePosts,
  ]);

  const pickMediaForEdit = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to your photos to add media to your post.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.9,
      videoMaxDuration: 60,
    });
    if (result.canceled) return;
    const newAssets: PickedAsset[] = result.assets.map((a) => ({
      uri: a.uri,
      mimeType: a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
      fileName: a.fileName ?? (a.type === "video" ? "video.mp4" : "image.jpg"),
    }));
    setEditLocalAssets((prev) => {
      const room = 5 - editRemoteUrls.length - prev.length;
      if (room <= 0) {
        Alert.alert("Limit reached", "You can add up to 5 photos or videos per post.");
        return prev;
      }
      return [...prev, ...newAssets.slice(0, room)];
    });
  }, [editRemoteUrls.length]);

  const pickFromCameraForEdit = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access to capture photos or videos for your post.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.9,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    const asset: PickedAsset = {
      uri: a.uri,
      mimeType: a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
      fileName: a.fileName ?? (a.type === "video" ? "video.mp4" : "image.jpg"),
    };
    setEditLocalAssets((prev) => {
      const room = 5 - editRemoteUrls.length - prev.length;
      if (room <= 0) {
        Alert.alert("Limit reached", "You can add up to 5 photos or videos per post.");
        return prev;
      }
      return [...prev, asset];
    });
  }, [editRemoteUrls.length]);

  const removeEditRemote = useCallback((index: number) => {
    setEditRemoteUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeEditLocal = useCallback((index: number) => {
    setEditLocalAssets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const openCreate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAssets([]);
    setCaption("");
    setPublishNow(true);
    setPrimaryCategorySlug(null);
    setOfferingId(null);
    setTagInput("");
    setCreateOpen(true);
  }, []);

  const pickMedia = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to your photos to add media to your post.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.9,
      videoMaxDuration: 60,
    });
    if (result.canceled) return;
    const newAssets: PickedAsset[] = result.assets.map((a) => ({
      uri: a.uri,
      mimeType: a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
      fileName: a.fileName ?? (a.type === "video" ? "video.mp4" : "image.jpg"),
    }));
    setSelectedAssets((prev) => [...prev, ...newAssets].slice(0, 5));
  }, []);

  const pickFromCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access to capture photos or videos for your post.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.9,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    setSelectedAssets((prev) =>
      [
        ...prev,
        {
          uri: a.uri,
          mimeType: a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg"),
          fileName: a.fileName ?? (a.type === "video" ? "video.mp4" : "image.jpg"),
        },
      ].slice(0, 5),
    );
  }, []);

  const removeAsset = useCallback((index: number) => {
    setSelectedAssets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCreatePost = useCallback(async () => {
    if (!canCreateExplorePosts) {
      Alert.alert("Permission", "You do not have permission to create Explore posts.");
      return;
    }
    if (selectedAssets.length === 0) {
      Alert.alert("Add media", "Select at least one photo or video.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUploading(true);
    const paths: string[] = [];
    try {
      for (let i = 0; i < selectedAssets.length; i++) {
        const asset = selectedAssets[i];
        const formData = new FormData();
        // §Provider-audit 2026-05: pin a sensible mime/name based on the
        // asset shape so HEIC photos and Android videos that arrive without
        // a type don't get rejected by the server. The upload endpoint also
        // now accepts heic/heif/gif/avif so iPhone library uploads work.
        const fallbackName =
          asset.fileName ??
          (asset.mimeType?.startsWith("video/") ? `video-${i}.mp4` : `image-${i}.jpg`);
        const safeType =
          asset.mimeType ??
          (fallbackName.toLowerCase().endsWith(".mp4") ||
          fallbackName.toLowerCase().endsWith(".mov") ||
          fallbackName.toLowerCase().endsWith(".m4v")
            ? "video/mp4"
            : "image/jpeg");
        appendFormDataFileNative(formData, "file", {
          uri: asset.uri,
          type: safeType,
          name: fallbackName,
        });
        const res = await api.fetch<{ path: string }>("/api/explore/upload", {
          method: "POST",
          body: formData,
        });
        if (res.error || !res.data?.path) {
          const msg =
            (res.error && typeof res.error === "object" && "message" in res.error
              ? (res.error as { message?: string }).message
              : null) ?? "Could not upload file.";
          Alert.alert("Upload failed", `${msg}\n(Item ${i + 1} of ${selectedAssets.length})`);
          setUploading(false);
          return;
        }
        paths.push(res.data.path);
      }
      const tags = [...new Set(tagInput.split(/[,]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(
        0,
        20,
      );
      const { error: createErr } = await createPost("/api/explore/posts", {
        caption: caption.trim() || null,
        media_urls: paths,
        status: publishNow ? "published" : "draft",
        ...(primaryCategorySlug ? { primary_category_slug: primaryCategorySlug } : {}),
        ...(tags.length ? { tags } : {}),
        ...(offeringId ? { offering_id: offeringId } : {}),
      });
      setUploading(false);
      if (createErr) {
        Alert.alert(
          publishNow ? "Couldn't publish post" : "Couldn't save draft",
          createErr,
        );
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateOpen(false);
      refresh();
    } catch (e) {
      setUploading(false);
      Alert.alert(
        publishNow ? "Couldn't publish post" : "Couldn't save draft",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    }
  }, [canCreateExplorePosts, selectedAssets, caption, publishNow, primaryCategorySlug, offeringId, tagInput, createPost, refresh]);

  const openCreateIfAllowed = useCallback(() => {
    if (!canCreateExplorePosts) {
      Alert.alert("Permission", "You do not have permission to create Explore posts.");
      return;
    }
    openCreate();
  }, [canCreateExplorePosts, openCreate]);

  const createHeaderAction = canCreateExplorePosts ? (
    <TouchableOpacity
      onPress={openCreateIfAllowed}
      style={twStyle("h-11 w-11 items-center justify-center rounded-full bg-[#ec4899] shadow-sm")}
      accessibilityLabel="Create new Explore post"
      accessibilityRole="button"
      hitSlop={6}
    >
      <Ionicons name="add" size={26} color="#fff" />
    </TouchableOpacity>
  ) : undefined;

  const openExploreFeed = useCallback(() => {
    const url = `${explorePublicBase()}/explore`;
    pushInAppBrowser(router, url, "Explore");
  }, [router]);

  const openPublicPost = useCallback(
    (postId: string) => {
      const url = `${explorePublicBase()}/explore/${postId}`;
      pushInAppBrowser(router, url, "Post on Explore");
    },
    [router],
  );

  const renderExploreGridItem = useCallback(
    ({ item: post, index }: { item: ExplorePost; index: number }) => {
      const thumb = post.media_urls?.[0];
      const col = index % exploreGridColumns;
      return (
        <TouchableOpacity
          onPress={() => openView(post)}
          activeOpacity={0.85}
          style={{
            width: exploreGridCellSize,
            height: exploreGridCellSize,
            marginRight: col === exploreGridColumns - 1 ? 0 : exploreGridGap,
            marginBottom: exploreGridGap,
            overflow: "hidden",
            backgroundColor: "#f3f4f6",
          }}
          accessibilityRole="button"
          accessibilityLabel={
            post.caption ? `Post: ${post.caption.slice(0, 80)}` : "Explore post"
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
              <Text style={{ fontSize: 10, fontWeight: "600", color: "#fff" }}>Draft</Text>
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
            Earn reward points when you post to Explore. Share your work to grow visibility and unlock rewards.
          </Text>
          <TouchableOpacity
            onPress={openCreateIfAllowed}
            style={twStyle("rounded-lg bg-pink-600 px-3 py-2")}
            accessibilityLabel="Create new post"
            accessibilityRole="button"
          >
            <Text style={twStyle("text-xs font-semibold text-white")}>Post now</Text>
          </TouchableOpacity>
        </View>
        <View
          style={twStyle("mb-4 flex-row flex-wrap items-center gap-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4")}
        >
          <View style={twStyle("mr-6 flex-row items-center gap-2")}>
            <Ionicons name="eye-outline" size={20} color="#6b7280" />
            <Text style={twStyle("text-sm text-gray-600")}>Total views</Text>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>{analyticsTotals.views}</Text>
          </View>
          <View style={twStyle("mr-6 flex-row items-center gap-2")}>
            <Ionicons name="heart-outline" size={20} color="#6b7280" />
            <Text style={twStyle("text-sm text-gray-600")}>Total likes</Text>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>{analyticsTotals.likes}</Text>
          </View>
          <TouchableOpacity
            onPress={openExploreFeed}
            style={twStyle("ml-auto flex-row items-center gap-1")}
            accessibilityRole="button"
            accessibilityLabel="Open Explore feed in browser"
          >
            <Ionicons name="open-outline" size={18} color="#db2777" />
            <Text style={twStyle("text-sm font-semibold text-[#db2777]")}>View Explore</Text>
          </TouchableOpacity>
        </View>
        <Text style={twStyle("mb-2 px-1 text-xs font-medium uppercase tracking-wide text-gray-500")}>
          Your posts
        </Text>
      </>
    );
  }, [
    posts.length,
    analyticsTotals.views,
    analyticsTotals.likes,
    openCreateIfAllowed,
    openExploreFeed,
  ]);

  const exploreListFooter = useMemo(() => {
    if (!canLoadMorePosts) return null;
    return (
      <TouchableOpacity
        onPress={() => void loadMorePosts()}
        disabled={loadingMorePosts}
        style={twStyle("mt-2 items-center rounded-xl border border-gray-200 bg-white px-4 py-3")}
        accessibilityRole="button"
        accessibilityLabel="Load more Explore posts"
      >
        {loadingMorePosts ? (
          <ActivityIndicator color="#ec4899" />
        ) : (
          <Text style={twStyle("text-sm font-semibold text-[#ec4899]")}>Load more posts</Text>
        )}
      </TouchableOpacity>
    );
  }, [canLoadMorePosts, loadMorePosts, loadingMorePosts]);

  const handleEndReachedExplore = useCallback(() => {
    if (!canLoadMorePosts || loadingMorePosts) return;
    void loadMorePosts();
  }, [canLoadMorePosts, loadingMorePosts, loadMorePosts]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader
          title="Explore"
          showBack
          subtitle="Your Explore posts"
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
          title="Explore"
          showBack
          subtitle="Your Explore posts"
          rightAction={createHeaderAction}
        />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const scrollBottomPad = tabScreenScrollBottomPadding(insets.bottom, 24) + 64;

  return (
    <ScreenContainer scrollable={false}>
      <View style={{ flex: 1, minHeight: 0 }}>
        <ScreenHeader title="Explore" showBack subtitle="Your Explore posts" rightAction={createHeaderAction} />

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
              title="No posts yet"
              description="Create your first post to appear in the Explore feed and earn reward points."
              actionLabel="Create post"
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
          accessibilityLabel="Create new Explore post"
          accessibilityRole="button"
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      </View>

      <BottomSheet
        visible={createOpen}
        onClose={() => !uploading && setCreateOpen(false)}
        title="New post"
        subtitle="Add photos or videos from your library or camera (up to 5)"
      >
        <View style={twStyle("mb-4 flex-row gap-2")}>
          <TouchableOpacity
            onPress={pickMedia}
            style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-5 px-2")}
          >
            <Ionicons name="images-outline" size={24} color="#9ca3af" />
            <Text style={twStyle("ml-2 text-center text-xs font-medium text-gray-600")}>
              {selectedAssets.length > 0 ? `Library (${selectedAssets.length}/5)` : "Library"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pickFromCamera}
            style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-5 px-2")}
          >
            <Ionicons name="camera-outline" size={24} color="#9ca3af" />
            <Text style={twStyle("ml-2 text-center text-xs font-medium text-gray-600")}>Camera</Text>
          </TouchableOpacity>
        </View>
        {selectedAssets.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={twStyle("-mx-1 mb-4")}
          >
            {selectedAssets.map((asset, i) => (
              <View key={i} style={twStyle("mr-2 h-20 w-20 overflow-hidden rounded-lg bg-gray-100")}>
                <Image
                  source={{ uri: asset.uri }}
                  style={twStyle("h-full w-full") as ExpoImageStyle}
                  contentFit="cover"
                />
                <TouchableOpacity
                  onPress={() => removeAsset(i)}
                  style={twStyle("absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60")}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        ) : null}
        {diversityTip ? (
          <View style={twStyle("mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3")}>
            <Text style={twStyle("text-sm text-amber-900")}>{diversityTip}</Text>
          </View>
        ) : null}
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Caption (optional)</Text>
        <TextInput
          style={twStyle("mb-4 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          placeholder="Write a caption..."
          placeholderTextColor="#9ca3af"
          value={caption}
          onChangeText={setCaption}
          multiline
        />
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Tags (optional)</Text>
        <TextInput
          style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
          placeholder="e.g. braids, balayage (comma-separated)"
          placeholderTextColor="#9ca3af"
          value={tagInput}
          onChangeText={setTagInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {offerings.length > 0 ? (
          <>
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Link a service (optional)</Text>
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>
              Lets customers tap through to book this look, same as on the web portal.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-4 -mx-1")}>
              <TouchableOpacity
                onPress={() => setOfferingId(null)}
                style={[twStyle("rounded-full px-4 py-2 mr-2"), offeringId === null ? twStyle("bg-violet-600") : twStyle("bg-gray-100")]}
              >
                <Text style={twStyle(offeringId === null ? "text-white text-sm font-medium" : "text-gray-600 text-sm")}>
                  None
                </Text>
              </TouchableOpacity>
              {offerings.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => setOfferingId(o.id)}
                  style={[
                    twStyle("rounded-full px-4 py-2 mr-2 max-w-[200px]"),
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
            <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Category (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-4 -mx-1")}>
              <TouchableOpacity
                onPress={() => setPrimaryCategorySlug(null)}
                style={[twStyle("rounded-full px-4 py-2 mr-2"), primaryCategorySlug === null ? twStyle("bg-indigo-600") : twStyle("bg-gray-100")]}
              >
                <Text style={twStyle(primaryCategorySlug === null ? "text-white text-sm font-medium" : "text-gray-600 text-sm")}>None</Text>
              </TouchableOpacity>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setPrimaryCategorySlug(c.slug)}
                  style={[twStyle("rounded-full px-4 py-2 mr-2"), primaryCategorySlug === c.slug ? twStyle("bg-indigo-600") : twStyle("bg-gray-100")]}
                >
                  <Text style={twStyle(primaryCategorySlug === c.slug ? "text-white text-sm font-medium" : "text-gray-600 text-sm")}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}
        <View style={twStyle("mb-4 flex-row")}>
          <TouchableOpacity
            onPress={() => setPublishNow(true)}
            style={[twStyle(`flex-1 rounded-xl py-3 ${publishNow ? "bg-green-600" : "bg-gray-100"}`), { marginRight: 12 }]}
          >
            <Text
              style={twStyle(`text-center text-sm font-medium ${publishNow ? "text-white" : "text-gray-600"}`)}
            >
              Publish now
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPublishNow(false)}
            style={twStyle(`flex-1 rounded-xl py-3 ${!publishNow ? "bg-gray-700" : "bg-gray-100"}`)}
          >
            <Text
              style={twStyle(`text-center text-sm font-medium ${!publishNow ? "text-white" : "text-gray-600"}`)}
            >
              Save as draft
            </Text>
          </TouchableOpacity>
        </View>
        <ActionButton
          label={
            uploading
              ? "Uploading…"
              : creating
                ? "Creating…"
                : "Create post"
          }
          onPress={handleCreatePost}
          loading={uploading || creating}
          fullWidth
        />
      </BottomSheet>

      {viewPost && (
        <BottomSheet
          visible={!!viewPost}
          onClose={() => !updating && !editUploading && setViewPost(null)}
          title={editMode ? "Edit post" : "Post"}
          snapHeight="full"
          subtitle={
            editMode
              ? undefined
              : `${viewPost.like_count} likes · ${viewPost.comment_count ?? 0} comments · ${
                  typeof viewPost.view_count === "number" ? viewPost.view_count : 0
                } views`
          }
        >
          {editMode ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={twStyle("pb-2")}
            >
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Photos & videos</Text>
              <Text style={twStyle("mb-3 text-xs text-gray-500")}>
                Up to 5 total. Remove items or add new ones — matches the web editor.
              </Text>
              <View style={twStyle("mb-3 flex-row gap-2")}>
                <TouchableOpacity
                  onPress={pickMediaForEdit}
                  disabled={editMediaSlotsLeft <= 0 || editUploading}
                  style={twStyle(
                    `flex-1 flex-row items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-4 px-2 ${editMediaSlotsLeft <= 0 ? "opacity-50" : ""}`,
                  )}
                >
                  <Ionicons name="images-outline" size={22} color="#9ca3af" />
                  <Text style={twStyle("ml-2 text-center text-xs font-medium text-gray-600")}>Library</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={pickFromCameraForEdit}
                  disabled={editMediaSlotsLeft <= 0 || editUploading}
                  style={twStyle(
                    `flex-1 flex-row items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-4 px-2 ${editMediaSlotsLeft <= 0 ? "opacity-50" : ""}`,
                  )}
                >
                  <Ionicons name="camera-outline" size={22} color="#9ca3af" />
                  <Text style={twStyle("ml-2 text-center text-xs font-medium text-gray-600")}>Camera</Text>
                </TouchableOpacity>
              </View>
              <Text style={twStyle("mb-2 text-xs text-gray-500")}>
                {editRemoteUrls.length + editLocalAssets.length}/5 selected
              </Text>
              {editRemoteUrls.length + editLocalAssets.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={twStyle("-mx-1 mb-4")}
                >
                  {editRemoteUrls.map((url, i) => (
                    <View key={`r-${url}-${i}`} style={twStyle("mr-2 h-20 w-20 overflow-hidden rounded-lg bg-gray-100")}>
                      {isVideoUrl(url) ? (
                        <View style={twStyle("h-full w-full")}>
                          <ExploreFeedMediaThumb uri={url} height={80} />
                        </View>
                      ) : (
                        <Image
                          source={{ uri: url }}
                          style={twStyle("h-full w-full") as ExpoImageStyle}
                          contentFit="cover"
                        />
                      )}
                      <TouchableOpacity
                        onPress={() => removeEditRemote(i)}
                        style={twStyle("absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60")}
                        accessibilityLabel="Remove media"
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {editLocalAssets.map((asset, i) => (
                    <View key={`l-${asset.uri}-${i}`} style={twStyle("mr-2 h-20 w-20 overflow-hidden rounded-lg bg-gray-100")}>
                      <Image
                        source={{ uri: asset.uri }}
                        style={twStyle("h-full w-full") as ExpoImageStyle}
                        contentFit="cover"
                      />
                      <TouchableOpacity
                        onPress={() => removeEditLocal(i)}
                        style={twStyle("absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60")}
                        accessibilityLabel="Remove new upload"
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : null}

              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Caption</Text>
              <TextInput
                style={twStyle("mb-4 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                placeholder="Write a caption..."
                placeholderTextColor="#9ca3af"
                value={editCaption}
                onChangeText={setEditCaption}
                multiline
              />
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Tags (optional)</Text>
              <TextInput
                style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                placeholder="e.g. braids, balayage (comma-separated)"
                placeholderTextColor="#9ca3af"
                value={editTagInput}
                onChangeText={setEditTagInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {offerings.length > 0 ? (
                <>
                  <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Link a service (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-4 -mx-1")}>
                    <TouchableOpacity
                      onPress={() => setEditOfferingId(null)}
                      style={[
                        twStyle("mr-2 rounded-full px-4 py-2"),
                        editOfferingId === null ? twStyle("bg-violet-600") : twStyle("bg-gray-100"),
                      ]}
                    >
                      <Text
                        style={twStyle(
                          editOfferingId === null ? "text-sm font-medium text-white" : "text-sm text-gray-600",
                        )}
                      >
                        None
                      </Text>
                    </TouchableOpacity>
                    {offerings.map((o) => (
                      <TouchableOpacity
                        key={o.id}
                        onPress={() => setEditOfferingId(o.id)}
                        style={[
                          twStyle("mr-2 max-w-[200px] rounded-full px-4 py-2"),
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
                  <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-4 -mx-1")}>
                    <TouchableOpacity
                      onPress={() => setEditPrimaryCategorySlug(null)}
                      style={[
                        twStyle("mr-2 rounded-full px-4 py-2"),
                        editPrimaryCategorySlug === null ? twStyle("bg-indigo-600") : twStyle("bg-gray-100"),
                      ]}
                    >
                      <Text
                        style={twStyle(
                          editPrimaryCategorySlug === null ? "text-sm font-medium text-white" : "text-sm text-gray-600",
                        )}
                      >
                        None
                      </Text>
                    </TouchableOpacity>
                    {categories.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setEditPrimaryCategorySlug(c.slug)}
                        style={[
                          twStyle("mr-2 rounded-full px-4 py-2"),
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
              <View style={twStyle("mb-4 flex-row")}>
                <TouchableOpacity
                  onPress={() => setEditPublishNow(true)}
                  style={[twStyle(`flex-1 rounded-xl py-3 ${editPublishNow ? "bg-green-600" : "bg-gray-100"}`), { marginRight: 12 }]}
                >
                  <Text
                    style={twStyle(`text-center text-sm font-medium ${editPublishNow ? "text-white" : "text-gray-600"}`)}
                  >
                    Publish
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEditPublishNow(false)}
                  style={twStyle(`flex-1 rounded-xl py-3 ${!editPublishNow ? "bg-gray-700" : "bg-gray-100"}`)}
                >
                  <Text
                    style={twStyle(`text-center text-sm font-medium ${!editPublishNow ? "text-white" : "text-gray-600"}`)}
                  >
                    Draft
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={twStyle("flex-row")}>
                <TouchableOpacity
                  onPress={() => {
                    setEditMode(false);
                    setEditLocalAssets([]);
                    if (viewPost) {
                      setEditRemoteUrls([...(viewPost.media_urls ?? [])]);
                      setEditTagInput(
                        Array.isArray(viewPost.tags) && viewPost.tags.length ? viewPost.tags.join(", ") : "",
                      );
                      setEditOfferingId(viewPost.offering_id ?? null);
                    }
                  }}
                  style={[twStyle("flex-1 rounded-xl border border-gray-300 py-3"), { marginRight: 12 }]}
                >
                  <Text style={twStyle("text-center text-sm font-medium text-gray-700")}>Cancel</Text>
                </TouchableOpacity>
                <View style={twStyle("flex-1")}>
                  <ActionButton
                    label={
                      editUploading ? "Uploading…" : updating ? "Saving…" : "Save"
                    }
                    onPress={handleSaveEdit}
                    loading={updating || editUploading}
                    fullWidth
                  />
                </View>
              </View>
            </ScrollView>
          ) : (
            <>
              {(() => {
                const urls = viewPost.media_urls ?? [];
                const pageW = exploreDetailMediaWidth;
                if (urls.length === 0) return null;
                return (
                  <View
                    style={{
                      marginBottom: 16,
                      width: pageW,
                      alignSelf: "center",
                    }}
                  >
                    {/*
                      Nested horizontal ScrollView must have an explicit height; otherwise
                      aspectRatio children do not lay out and images appear blank (RN).
                    */}
                    <ScrollView
                      horizontal
                      nestedScrollEnabled
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      style={{ width: pageW, height: pageW }}
                    >
                      {urls.map((url, idx) => (
                        <View key={`${url}-${idx}`} style={{ width: pageW, height: pageW }}>
                          <View
                            style={{
                              width: "100%",
                              height: "100%",
                              borderRadius: 12,
                              overflow: "hidden",
                              backgroundColor: "#f3f4f6",
                            }}
                          >
                            {isVideoUrl(url) ? (
                              <Video
                                source={{ uri: url }}
                                style={StyleSheet.absoluteFillObject}
                                resizeMode={ResizeMode.COVER}
                                useNativeControls
                                shouldPlay={false}
                                isLooping
                              />
                            ) : (
                              <Image
                                source={{ uri: url }}
                                style={twStyle("h-full w-full") as ExpoImageStyle}
                                contentFit="cover"
                                accessibilityLabel={`Post media ${idx + 1} of ${urls.length}`}
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
                                  {idx + 1} / {urls.length}
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
              <Text style={twStyle("mb-2 text-xs text-gray-500")}>{formatPublishedLine(viewPost)}</Text>
              {viewPost.primary_category_id ? (
                <View style={twStyle("mb-3 flex-row flex-wrap")}>
                  <View style={twStyle("rounded-full bg-indigo-50 px-2.5 py-1")}>
                    <Text style={twStyle("text-xs font-medium text-indigo-800")}>
                      {categories.find((c) => c.id === viewPost.primary_category_id)?.name ?? "Category"}
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
                    Linked service
                  </Text>
                  <Text style={twStyle("mt-0.5 text-sm font-medium text-violet-900")}>{viewPost.offering.name}</Text>
                  {typeof viewPost.offering.price === "number" ? (
                    <Text style={twStyle("text-xs text-violet-700")}>From your catalog · tap Explore to book</Text>
                  ) : null}
                </View>
              ) : null}
              <Text style={twStyle("mb-3 text-sm leading-5 text-gray-700")}>
                {viewPost.caption || "No caption"}
              </Text>
              <View style={twStyle("mb-4 flex-row flex-wrap items-center gap-x-3 gap-y-2")}>
                <View
                  style={[twStyle(`rounded-full px-2.5 py-1 ${viewPost.status === "published" ? "bg-green-100" : "bg-gray-100"}`)]}
                >
                  <Text
                    style={twStyle(`text-xs font-medium ${viewPost.status === "published" ? "text-green-800" : "text-gray-600"}`)}
                  >
                    {viewPost.status}
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
                  accessibilityLabel="Open this post on the public Explore site"
                >
                  <Ionicons name="open-outline" size={18} color="#db2777" />
                  <Text style={twStyle("ml-2 text-sm font-semibold text-[#db2777]")}>View on Explore</Text>
                </TouchableOpacity>
              ) : null}
              {canCreateExplorePosts ? (
                <View style={twStyle("mb-4 flex-row gap-2")}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditCaption(viewPost.caption ?? "");
                      setEditPublishNow(viewPost.status === "published");
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
                      setEditLocalAssets([]);
                      setEditMode(true);
                    }}
                    style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-3")}
                  >
                    <Ionicons name="pencil-outline" size={18} color="#6366f1" />
                    <Text style={twStyle("ml-1.5 text-sm font-medium text-indigo-600")}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => viewPost && handleDelete(viewPost)}
                    style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-red-200 bg-red-50 py-3")}
                  >
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    <Text style={twStyle("ml-1.5 text-sm font-medium text-red-600")}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>Comments</Text>
              {commentsLoading ? (
                <Text style={twStyle("mb-3 text-sm text-gray-500")}>Loading comments…</Text>
              ) : comments.length === 0 ? (
                <Text style={twStyle("mb-3 text-sm text-gray-500")}>No comments yet.</Text>
              ) : (
                <ScrollView style={twStyle("mb-3 max-h-40")} nestedScrollEnabled>
                  {comments.map((c) => (
                    <View key={c.id} style={twStyle("mb-2 rounded-lg bg-gray-50 px-3 py-2")}>
                      <Text style={twStyle("text-xs font-medium text-gray-700")}>
                        {c.author?.full_name ?? "Someone"}
                      </Text>
                      <Text style={twStyle("text-sm text-gray-900")}>{c.body}</Text>
                      <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                        {formatDateSafe(c.created_at)}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              <View style={twStyle("flex-row items-end")}>
                <TextInput
                  style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-base text-gray-900"), { marginRight: 8 }]}
                  placeholder="Add a comment…"
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
                      Alert.alert("Error", err);
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
                    {postingComment ? "Posting…" : "Post"}
                  </Text>
                </TouchableOpacity>
              </View>
              {commentBody.length > 0 && (
                <Text style={twStyle("mt-1 text-xs text-gray-500")}>{commentBody.length}/200</Text>
              )}
            </>
          )}
        </BottomSheet>
      )}
    </ScreenContainer>
  );
}
