import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  RefreshControl,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";

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
  created_at: string;
  updated_at: string;
}

interface ExploreComment {
  id: string;
  post_id: string;
  user_id: string;
  author: { id: string; full_name: string | null; avatar_url: string | null };
  body: string;
  created_at: string;
}

type PickedAsset = { uri: string; mimeType?: string; fileName?: string };

export default function ExplorePostsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<PickedAsset[]>([]);
  const [caption, setCaption] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [viewPost, setViewPost] = useState<ExplorePost | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editPublishNow, setEditPublishNow] = useState(true);

  const { data, loading, error, refresh } = useApi<ExplorePost[]>("/api/explore/posts/mine");
  const { execute: deletePost } = useApiMutation("delete");
  const { execute: createPost, loading: creating } = useApiMutation<ExplorePost>("post");
  const { execute: updatePost, loading: updating } = useApiMutation<ExplorePost>("patch");

  const commentsPath = viewPost ? `/api/explore/posts/${viewPost.id}/comments` : "";
  const { data: commentsResp, loading: commentsLoading, refresh: refreshComments } = useApi<{
    data: ExploreComment[];
  }>(commentsPath || "/api/explore/posts/comments", { enabled: !!viewPost && !editMode });
  const { execute: postComment, loading: postingComment } = useApiMutation<ExploreComment>("post");

  const [commentBody, setCommentBody] = useState("");

  const posts: ExplorePost[] = data ?? [];
  const comments: ExploreComment[] = commentsResp?.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const openView = useCallback((post: ExplorePost) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewPost(post);
    setEditMode(false);
    setEditCaption(post.caption ?? "");
    setEditPublishNow(post.status === "published");
  }, []);

  const handleDelete = useCallback(
    (post: ExplorePost) => {
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
    [deletePost, refresh]
  );

  const handleSaveEdit = useCallback(async () => {
    if (!viewPost) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { data: updated, error: err } = await updatePost(`/api/explore/posts/${viewPost.id}`, {
      caption: editCaption.trim() || null,
      status: editPublishNow ? "published" : "draft",
    });
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (updated) setViewPost(updated);
    setEditMode(false);
    refresh();
  }, [viewPost, editCaption, editPublishNow, updatePost, refresh]);

  const openCreate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAssets([]);
    setCaption("");
    setPublishNow(true);
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

  const removeAsset = useCallback((index: number) => {
    setSelectedAssets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCreatePost = useCallback(async () => {
    if (selectedAssets.length === 0) {
      Alert.alert("Add media", "Select at least one photo or video.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUploading(true);
    const paths: string[] = [];
    try {
      for (const asset of selectedAssets) {
        const formData = new FormData();
        formData.append("file", {
          uri: asset.uri,
          type: asset.mimeType ?? "image/jpeg",
          name: asset.fileName ?? "image.jpg",
        } as unknown as Blob);
        const res = await api.fetch<{ path: string }>("/api/explore/upload", {
          method: "POST",
          body: formData,
        });
        if (res.error || !res.data?.path) {
          Alert.alert("Upload failed", res.error?.message ?? "Could not upload file.");
          setUploading(false);
          return;
        }
        paths.push(res.data.path);
      }
      const { error: createErr } = await createPost("/api/explore/posts", {
        caption: caption.trim() || null,
        media_urls: paths,
        status: publishNow ? "published" : "draft",
      });
      setUploading(false);
      if (createErr) {
        Alert.alert("Error", createErr);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateOpen(false);
      refresh();
    } catch (e) {
      setUploading(false);
      Alert.alert("Error", e instanceof Error ? e.message : "Something went wrong.");
    }
  }, [selectedAssets, caption, publishNow, createPost, refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Explore" showBack subtitle="Posts for Explore feed" />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Explore" showBack subtitle="Posts for Explore feed" />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Explore"
        showBack
        subtitle="Posts for Explore feed"
        rightAction={
          <TouchableOpacity
            onPress={openCreate}
            className="flex-row items-center rounded-xl bg-[#ec4899] px-4 py-2"
            accessibilityLabel="Create post"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text className="ml-1.5 text-sm font-semibold text-white">
              Create post
            </Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {posts.length === 0 ? (
          <EmptyState
            icon="camera-outline"
            title="No posts yet"
            description="Create posts for the Explore feed and earn reward points."
            actionLabel="Create post"
            onAction={openCreate}
          />
        ) : (
          <>
            <View className="mb-3 mt-1 flex-row items-center rounded-xl bg-pink-50 p-3">
              <Ionicons name="gift-outline" size={20} color="#be185d" />
              <Text className="ml-2 flex-1 text-sm text-pink-900">
                Earn reward points when you post to Explore.
              </Text>
            </View>
            <View className="gap-4">
              {posts.map((post) => {
                const thumb = post.media_urls?.[0];
                const isVideo =
                  thumb &&
                  /\.(mp4|webm|mov)$/i.test(thumb);
                return (
                  <TouchableOpacity
                    key={post.id}
                    onPress={() => openView(post)}
                    activeOpacity={0.85}
                    className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
                  >
                    <View className="aspect-square bg-gray-100">
                      {thumb && !isVideo ? (
                        <Image
                          source={{ uri: thumb }}
                          className="h-full w-full"
                          resizeMode="cover"
                          accessibilityLabel="Post image"
                        />
                      ) : thumb && isVideo ? (
                        <View className="h-full w-full items-center justify-center bg-gray-200">
                          <Ionicons name="videocam" size={48} color="#9ca3af" />
                        </View>
                      ) : (
                        <View className="h-full w-full items-center justify-center">
                          <Ionicons name="image-outline" size={48} color="#d1d5db" />
                        </View>
                      )}
                    </View>
                    <View className="p-3">
                      <Text
                        className="text-sm text-gray-700"
                        numberOfLines={2}
                      >
                        {post.caption || "No caption"}
                      </Text>
                      <View className="mt-2 flex-row flex-wrap items-center gap-2">
                        <View
                          className={`rounded-full px-2.5 py-0.5 ${
                            post.status === "published"
                              ? "bg-green-100"
                              : "bg-gray-100"
                          }`}
                        >
                          <Text
                            className={`text-xs font-medium ${
                              post.status === "published"
                                ? "text-green-800"
                                : "text-gray-600"
                            }`}
                          >
                            {post.status}
                          </Text>
                        </View>
                        <Text className="text-xs text-gray-500">
                          {post.like_count} likes · {post.comment_count ?? 0} comments
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={createOpen}
        onClose={() => !uploading && setCreateOpen(false)}
        title="New post"
        subtitle="Add at least one photo or video"
      >
        <TouchableOpacity
          onPress={pickMedia}
          className="mb-4 flex-row items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-6"
        >
          <Ionicons name="images-outline" size={28} color="#9ca3af" />
          <Text className="ml-2 text-sm font-medium text-gray-600">
            {selectedAssets.length > 0
              ? `Add more (${selectedAssets.length}/5)`
              : "Pick photos or videos"}
          </Text>
        </TouchableOpacity>
        {selectedAssets.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-1 mb-4"
          >
            {selectedAssets.map((asset, i) => (
              <View key={i} className="mr-2 h-20 w-20 overflow-hidden rounded-lg bg-gray-100">
                <Image
                  source={{ uri: asset.uri }}
                  className="h-full w-full"
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={() => removeAsset(i)}
                  className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60"
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <Text className="mb-2 text-sm font-medium text-gray-700">Caption (optional)</Text>
        <TextInput
          className="mb-4 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          placeholder="Write a caption..."
          placeholderTextColor="#9ca3af"
          value={caption}
          onChangeText={setCaption}
          multiline
        />
        <View className="mb-4 flex-row gap-3">
          <TouchableOpacity
            onPress={() => setPublishNow(true)}
            className={`flex-1 rounded-xl py-3 ${publishNow ? "bg-green-600" : "bg-gray-100"}`}
          >
            <Text
              className={`text-center text-sm font-medium ${publishNow ? "text-white" : "text-gray-600"}`}
            >
              Publish now
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPublishNow(false)}
            className={`flex-1 rounded-xl py-3 ${!publishNow ? "bg-gray-700" : "bg-gray-100"}`}
          >
            <Text
              className={`text-center text-sm font-medium ${!publishNow ? "text-white" : "text-gray-600"}`}
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
          onClose={() => !updating && setViewPost(null)}
          title={editMode ? "Edit post" : "Post"}
          subtitle={
            editMode
              ? undefined
              : `${viewPost.like_count} likes · ${viewPost.comment_count ?? 0} comments`
          }
        >
          {editMode ? (
            <>
              <Text className="mb-2 text-sm font-medium text-gray-700">Caption</Text>
              <TextInput
                className="mb-4 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                placeholder="Write a caption..."
                placeholderTextColor="#9ca3af"
                value={editCaption}
                onChangeText={setEditCaption}
                multiline
              />
              <View className="mb-4 flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setEditPublishNow(true)}
                  className={`flex-1 rounded-xl py-3 ${editPublishNow ? "bg-green-600" : "bg-gray-100"}`}
                >
                  <Text
                    className={`text-center text-sm font-medium ${editPublishNow ? "text-white" : "text-gray-600"}`}
                  >
                    Publish
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEditPublishNow(false)}
                  className={`flex-1 rounded-xl py-3 ${!editPublishNow ? "bg-gray-700" : "bg-gray-100"}`}
                >
                  <Text
                    className={`text-center text-sm font-medium ${!editPublishNow ? "text-white" : "text-gray-600"}`}
                  >
                    Draft
                  </Text>
                </TouchableOpacity>
              </View>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setEditMode(false)}
                  className="flex-1 rounded-xl border border-gray-300 py-3"
                >
                  <Text className="text-center text-sm font-medium text-gray-700">Cancel</Text>
                </TouchableOpacity>
                <View className="flex-1">
                  <ActionButton
                    label={updating ? "Saving…" : "Save"}
                    onPress={handleSaveEdit}
                    loading={updating}
                    fullWidth
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              {viewPost.media_urls?.[0] && !/\.(mp4|webm|mov)$/i.test(viewPost.media_urls[0]) ? (
                <View className="mb-4 aspect-square overflow-hidden rounded-xl bg-gray-100">
                  <Image
                    source={{ uri: viewPost.media_urls[0] }}
                    className="h-full w-full"
                    resizeMode="cover"
                  />
                </View>
              ) : null}
              <Text className="mb-2 text-sm text-gray-700">
                {viewPost.caption || "No caption"}
              </Text>
              <View className="mb-4 flex-row flex-wrap gap-2">
                <View
                  className={`rounded-full px-2.5 py-1 ${viewPost.status === "published" ? "bg-green-100" : "bg-gray-100"}`}
                >
                  <Text
                    className={`text-xs font-medium ${viewPost.status === "published" ? "text-green-800" : "text-gray-600"}`}
                  >
                    {viewPost.status}
                  </Text>
                </View>
                {typeof viewPost.view_count === "number" && (
                  <Text className="text-xs text-gray-500">{viewPost.view_count} views</Text>
                )}
              </View>
              <View className="mb-4 flex-row gap-3">
                <TouchableOpacity
                  onPress={() => {
                    setEditCaption(viewPost.caption ?? "");
                    setEditPublishNow(viewPost.status === "published");
                    setEditMode(true);
                  }}
                  className="flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-3"
                >
                  <Ionicons name="pencil-outline" size={18} color="#6366f1" />
                  <Text className="ml-1.5 text-sm font-medium text-indigo-600">Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => viewPost && handleDelete(viewPost)}
                  className="flex-1 flex-row items-center justify-center rounded-xl border border-red-200 bg-red-50 py-3"
                >
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  <Text className="ml-1.5 text-sm font-medium text-red-600">Delete</Text>
                </TouchableOpacity>
              </View>

              <Text className="mb-2 text-sm font-medium text-gray-700">Comments</Text>
              {commentsLoading ? (
                <Text className="mb-3 text-sm text-gray-500">Loading comments…</Text>
              ) : comments.length === 0 ? (
                <Text className="mb-3 text-sm text-gray-500">No comments yet.</Text>
              ) : (
                <ScrollView className="mb-3 max-h-40" nestedScrollEnabled>
                  {comments.map((c) => (
                    <View key={c.id} className="mb-2 rounded-lg bg-gray-50 px-3 py-2">
                      <Text className="text-xs font-medium text-gray-700">
                        {c.author?.full_name ?? "Someone"}
                      </Text>
                      <Text className="text-sm text-gray-900">{c.body}</Text>
                      <Text className="mt-0.5 text-xs text-gray-500">
                        {new Date(c.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              <View className="flex-row items-end gap-2">
                <TextInput
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-base text-gray-900"
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
                  className="rounded-xl bg-indigo-600 px-4 py-2.5"
                >
                  <Text className="text-sm font-medium text-white">
                    {postingComment ? "Posting…" : "Post"}
                  </Text>
                </TouchableOpacity>
              </View>
              {commentBody.length > 0 && (
                <Text className="mt-1 text-xs text-gray-500">{commentBody.length}/200</Text>
              )}
            </>
          )}
        </BottomSheet>
      )}
    </ScreenContainer>
  );
}
