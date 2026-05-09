import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { CustomOfferSheet } from "@/components/CustomOfferSheet";
import { formatTime, formatCurrency, formatDateTime } from "@/lib/format";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase/client";
import { Colors } from "@/constants/colors";
import * as Haptics from "expo-haptics";
import { twStyle } from "@/lib/twStyle";
import { chatFlatListPerf } from "@/lib/flatListPerformance";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { api } from "@/lib/api-client";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { pushInAppBrowser } from "@/lib/in-app-web";

interface CustomOfferAttachment {
  type: "custom_offer";
  offer_id?: string;
  price?: number;
  currency?: string;
  duration_minutes?: number;
  preferred_start_at?: string | null;
  withdrawn?: boolean;
  expired?: boolean;
  status?: string;
}

interface ProviderOfferDetail {
  id: string;
  status: string;
  price?: number;
  currency?: string;
  duration_minutes?: number;
  expiration_at?: string | null;
  notes?: string | null;
  travel_fee?: number | null;
  request?: {
    service_name?: string | null;
    description?: string | null;
    location_type?: string | null;
    preferred_start_at?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    address_city?: string | null;
    address_state?: string | null;
    address_postal_code?: string | null;
  } | null;
}

/** Files from /api/me/messages/upload or legacy URLs in JSON */
interface FileLikeAttachment {
  url?: string;
  type?: string;
  name?: string;
  size?: number;
  expired?: boolean;
}

interface Message {
  id: string;
  content: string;
  sender_type: "provider" | "customer";
  created_at: string;
  read_at: string | null;
  attachments?: (CustomOfferAttachment | FileLikeAttachment | { type?: string })[];
}

/** Supabase Realtime `payload.new` for `public.messages` (fields used in this screen). */
interface RealtimeMessageRow {
  id?: string;
  content?: string | null;
  sender_role?: string | null;
  created_at?: string;
  read_at?: string | null;
  attachments?: unknown;
}

function isImageMime(t?: string) {
  return typeof t === "string" && t.startsWith("image/");
}
function isVideoMime(t?: string) {
  return typeof t === "string" && t.startsWith("video/");
}

function fileLikeAttachments(attachments: Message["attachments"]): FileLikeAttachment[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.filter((a): a is FileLikeAttachment => {
    if (!a || typeof a !== "object") return false;
    const t = (a as { type?: string }).type;
    if (t === "custom_offer" || t === "custom_request") return false;
    return true;
  }) as FileLikeAttachment[];
}

interface ConversationDetail {
  id: string;
  customer_id?: string;
  customer_name: string;
  customer_avatar_url: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  messages: Message[];
}

export default function ChatScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : undefined;

  const [message, setMessage] = useState("");
  const [showCustomOfferSheet, setShowCustomOfferSheet] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [offerDetailVisible, setOfferDetailVisible] = useState(false);
  const [offerDetailLoading, setOfferDetailLoading] = useState(false);
  const [offerDetailData, setOfferDetailData] = useState<ProviderOfferDetail | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // §UI-audit 2026-04: `initialScrollDone` used to be a module-level
  // mutable object shared across every mount, so switching between two
  // threads with the same message count never re-ran scroll-to-bottom.
  // It is now a per-mount ref that resets whenever `conversationId`
  // changes, together with the `scrollKey` trick that re-runs the
  // scroll effect on thread change even if the length is identical.
  const initialScrollDoneRef = useRef(false);

  const {
    data: conversation,
    loading,
    error: conversationError,
    refresh,
  } = useApi<ConversationDetail>(`/api/provider/conversations/${conversationId}`, {
    enabled: !!conversationId,
    staleTimeMs: 0,
  });
  const { execute: sendMessage, loading: sending } = useApiPost<any, any>(
    `/api/provider/conversations/${conversationId ?? ""}/messages`
  );
  const { execute: markRead } = useApiMutation("post");
  const { execute: retractOffer } = useApiMutation("post");
  const { execute: deleteConv } = useApiMutation("delete");

  const [realtimeMessages, setRealtimeMessages] = useState<Message[]>([]);
  const [optimisticMessage, setOptimisticMessage] = useState<Message | null>(null);
  const fromConv = conversation?.messages ?? [];
  const convIds = new Set(fromConv.map((m) => m.id));
  const fromRealtime = realtimeMessages.filter((m) => !convIds.has(m.id));
  const combined = [...fromConv, ...fromRealtime];
  if (optimisticMessage && !combined.some((m) => m.id === optimisticMessage.id))
    combined.push(optimisticMessage);
  const allMessages = combined.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const refreshRef = useRef(refresh);
  const markReadRef = useRef(markRead);
  const messagesRealtimeGenRef = useRef(0);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    markReadRef.current = markRead;
  }, [markRead]);

  // §Provider-audit 2026-04 (round 6): mark-read dependencies previously
  // included the whole `conversation` object, which re-references on every
  // refresh (realtime update, manual refresh). That caused a mark-read
  // POST storm — one per refresh — and a race with realtime inserts. We
  // now fire exactly once per thread open (per conversationId).
  useEffect(() => {
    if (!conversationId) return;
    markReadRef.current(`/api/provider/conversations/${conversationId}/mark-read`, {});
    api
      .post("/api/provider/notifications/mark-related-read", { conversation_id: conversationId })
      .catch(() => {});
  }, [conversationId]);

  // Reset the "first scroll" flag whenever we switch threads so the
  // initial scroll-to-bottom runs again for the new conversation even
  // if its message count happens to equal the previous one.
  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    if (allMessages.length === 0) return;
    const animated = initialScrollDoneRef.current;
    const t = setTimeout(
      () => flatListRef.current?.scrollToEnd({ animated }),
      100,
    );
    initialScrollDoneRef.current = true;
    return () => clearTimeout(t);
  }, [conversationId, allMessages.length]);

  // Supabase Realtime: live incoming messages and read receipt updates
  useEffect(() => {
    if (!conversationId) return;
    setRealtimeMessages([]);
    const topic = `provider-messages:${conversationId}:${++messagesRealtimeGenRef.current}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as RealtimeMessageRow;
          if (!m.id || !m.created_at) return;
          const rowId = m.id;
          const rowCreatedAt = m.created_at;
          setRealtimeMessages((prev) => {
            if (prev.some((p) => p.id === rowId)) return prev;
            const att = Array.isArray(m.attachments) ? m.attachments : [];
            return [
              ...prev,
              {
                id: rowId,
                content: m.content ?? "",
                sender_type: (m.sender_role === "customer" ? "customer" : "provider") as "provider" | "customer",
                created_at: rowCreatedAt,
                read_at: m.read_at ?? null,
                attachments: att as Message["attachments"],
              },
            ];
          });
          // §Provider-audit 2026-04 (round 6): if a customer message
          // arrives while the thread is open, immediately mark it read
          // server-side. Without this the conversations list kept the
          // unread badge until the user closed & reopened the thread.
          if (m.sender_role === "customer") {
            markReadRef.current(
              `/api/provider/conversations/${conversationId}/mark-read`,
              {},
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as RealtimeMessageRow;
          setRealtimeMessages((prev) =>
            prev.map((msg) =>
              updated.id && msg.id === updated.id ? { 
                ...msg, 
                read_at: updated.read_at ?? null,
                attachments: Array.isArray(updated.attachments) && updated.attachments.length > 0
                  ? (updated.attachments as Message["attachments"])
                  : msg.attachments
              } : msg
            )
          );
          void refreshRef.current();
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // Ignore
      }
    };
  }, [conversationId]);

  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text || !conversationId || sending) return;
    setMessage("");
    const optId = `opt-${Date.now()}`;
    setOptimisticMessage({
      id: optId,
      content: text,
      sender_type: "provider",
      created_at: new Date().toISOString(),
      read_at: null,
    });
    const { error } = await sendMessage({ content: text });
    if (!error) {
      refresh().then(() => setOptimisticMessage(null));
    } else {
      setOptimisticMessage(null);
      setMessage(text);
      Alert.alert("Send failed", typeof error === "string" ? error : "Message could not be sent. Please try again.");
    }
  }, [message, conversationId, sending, sendMessage, refresh]);

  const uploadNativeFile = useCallback(
    async (file: { uri: string; name: string; type: string }) => {
      if (!conversationId || sending || uploading) return;
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("conversation_id", conversationId);
        appendFormDataFileNative(formData, "files", {
          uri: file.uri,
          name: file.name,
          type: file.type || "application/octet-stream",
        });
        const res = await api.fetch<{ attachments?: FileLikeAttachment[] }>("/api/me/messages/upload", {
          method: "POST",
          body: formData,
        });
        if (res.error) {
          Alert.alert("Upload failed", res.error.message || "Could not upload file");
          return;
        }
        const payload = res.data as { attachments?: FileLikeAttachment[] } | null;
        const atts = payload?.attachments ?? [];
        if (!atts.length) {
          Alert.alert("Upload failed", "No file was uploaded.");
          return;
        }
        const { error } = await sendMessage({ attachments: atts } as never);
        if (error) Alert.alert("Error", error);
        else await refresh();
      } finally {
        setUploading(false);
      }
    },
    [conversationId, sending, uploading, sendMessage, refresh],
  );

  const openAttachmentMenu = useCallback(() => {
    if (!conversationId || sending || uploading) return;

    const choosePhotoLibrary = async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo library access to attach images.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await uploadNativeFile({
        uri: asset.uri,
        name: asset.fileName || "photo.jpg",
        type: asset.mimeType || "image/jpeg",
      });
    };

    const chooseVideoLibrary = async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo library access to attach videos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const mime =
        asset.mimeType ||
        (asset.fileName?.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
      await uploadNativeFile({
        uri: asset.uri,
        name: asset.fileName || "video.mp4",
        type: mime,
      });
    };

    const chooseCameraPhoto = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow camera access to take a photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await uploadNativeFile({
        uri: asset.uri,
        name: asset.fileName || "photo.jpg",
        type: asset.mimeType || "image/jpeg",
      });
    };

    const chooseCameraVideo = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow camera access to record a video.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: 120,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await uploadNativeFile({
        uri: asset.uri,
        name: asset.fileName || "video.mp4",
        type: asset.mimeType || "video/mp4",
      });
    };

    const chooseDocument = async () => {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      await uploadNativeFile({
        uri: asset.uri,
        name: asset.name || "document.pdf",
        type: asset.mimeType || "application/pdf",
      });
    };

    if (Platform.OS === "web") {
      Alert.alert("Attach", "Choose a source", [
        { text: "Photo library", onPress: () => void choosePhotoLibrary() },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            "Photo library",
            "Take photo",
            "Video library",
            "Record video",
            "Document (PDF, Word)",
            "Cancel",
          ],
          cancelButtonIndex: 5,
        },
        (idx) => {
          if (idx === 0) void choosePhotoLibrary();
          else if (idx === 1) void chooseCameraPhoto();
          else if (idx === 2) void chooseVideoLibrary();
          else if (idx === 3) void chooseCameraVideo();
          else if (idx === 4) void chooseDocument();
        },
      );
      return;
    }

    Alert.alert("Attach file", "Choose a source", [
      { text: "Photo library", onPress: () => void choosePhotoLibrary() },
      { text: "Take photo", onPress: () => void chooseCameraPhoto() },
      { text: "Video library", onPress: () => void chooseVideoLibrary() },
      { text: "Record video", onPress: () => void chooseCameraVideo() },
      { text: "Document", onPress: () => void chooseDocument() },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [conversationId, sending, uploading, uploadNativeFile]);

  const openOfferDetail = useCallback(async (offerId: string) => {
    setOfferDetailData(null);
    setOfferDetailVisible(true);
    setOfferDetailLoading(true);
    try {
      const res = await api.get<ProviderOfferDetail>(`/api/provider/custom-offers/${offerId}`);
      if (res.data) setOfferDetailData(res.data);
    } catch {
      // leave null — sheet shows error state
    } finally {
      setOfferDetailLoading(false);
    }
  }, []);

  const handleWithdrawOffer = useCallback(
    async (offerId: string) => {
      if (!offerId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { error } = await retractOffer(`/api/provider/custom-offers/${offerId}/retract`, {});
      if (error) Alert.alert("Error", error);
      else refresh();
    },
    [retractOffer, refresh]
  );

  const customerId = (conversation as ConversationDetail | undefined)?.customer_id;
  const customerPhone = (conversation as ConversationDetail | undefined)?.customer_phone;
  const customerEmail = (conversation as ConversationDetail | undefined)?.customer_email;

  const showClientMenu = useCallback(() => {
    const options: string[] = [];
    if (customerId) options.push("View booking history");
    if (customerPhone) options.push("Call client");
    if (customerPhone) options.push("Copy phone");
    if (customerEmail) options.push("Copy email");
    options.push("Delete conversation");
    options.push("Cancel");
    const deleteIndex = options.length - 2;
    const cancelIndex = options.length - 1;
    const runDelete = () => {
      Alert.alert("Delete conversation", "Remove this conversation? You can start a new chat with this client later.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!conversationId) return;
            const { error } = await deleteConv(`/api/provider/conversations/${conversationId}`);
            if (!error) router.back();
            else Alert.alert("Error", error);
          },
        },
      ]);
    };

    const handler = (idx: number) => {
      if (idx === cancelIndex) return;
      if (idx === deleteIndex) {
        runDelete();
        return;
      }
      let i = 0;
      if (customerId && idx === i++) {
        router.push(`/(app)/(tabs)/clients/${customerId}` as never);
        return;
      }
      if (customerPhone && idx === i++) { Linking.openURL(`tel:${customerPhone}`); return; }
      if (customerPhone && idx === i++) { Clipboard.setStringAsync(customerPhone); return; }
      if (customerEmail && idx === i) { Clipboard.setStringAsync(customerEmail); return; }
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: deleteIndex, title: "Client details" },
        handler
      );
    } else {
      Alert.alert(
        "Client details",
        undefined,
        [
          { text: "Cancel", style: "cancel" },
          ...(customerId ? [{ text: "View booking history", onPress: () => router.push(`/(app)/(tabs)/clients/${customerId}` as never) }] : []),
          ...(customerPhone ? [{ text: "Call", onPress: () => Linking.openURL(`tel:${customerPhone}`) }] : []),
          ...(customerPhone ? [{ text: "Copy phone", onPress: () => Clipboard.setStringAsync(customerPhone) }] : []),
          ...(customerEmail ? [{ text: "Copy email", onPress: () => Clipboard.setStringAsync(customerEmail) }] : []),
          { text: "Delete conversation", style: "destructive", onPress: runDelete },
        ].filter(Boolean) as { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[]
      );
    }
  }, [conversationId, customerId, customerPhone, customerEmail, deleteConv, router]);

  // No conversation id (invalid or list opened without id)
  if (!conversationId) {
    return (
      <SafeAreaView style={twStyle("flex-1 bg-white")} edges={["top"]}>
        <ScreenHeader title="Chat" showBack />
        <ErrorState
          message="No conversation selected"
          onRetry={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  // API error
  if (conversationError && !conversation) {
    return (
      <SafeAreaView style={twStyle("flex-1 bg-white")} edges={["top"]}>
        <ScreenHeader title="Chat" showBack />
        <ErrorState message={conversationError} onRetry={refresh} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={twStyle("flex-1 bg-white")} edges={["top"]}>
      {/* §UI-audit 2026-04: single focus header (AppHeader is hidden
          on this route). Added a customer avatar next to the title so
          the thread clearly identifies the other party. */}
      <View style={twStyle("border-b border-gray-100 px-4")}>
        <ScreenHeader
          title={conversation?.customer_name ?? "Chat"}
          showBack
          leadingContent={
            conversation?.customer_avatar_url ? (
              <Image
                source={{ uri: conversation.customer_avatar_url }}
                style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }}
                contentFit="cover"
                transition={120}
              />
            ) : conversation?.customer_name ? (
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  marginRight: 10,
                  backgroundColor: Colors.gray[100],
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.gray[700] }}>
                  {conversation.customer_name
                    .split(" ")
                    .map((p) => p[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </Text>
              </View>
            ) : null
          }
          rightAction={
            <View style={twStyle("flex-row items-center")}>
              <TouchableOpacity
                onPress={showClientMenu}
                style={[twStyle("p-2 rounded-full bg-gray-100"), { marginRight: 4 }]}
                accessibilityLabel="Client details and options"
              >
                <Ionicons name="ellipsis-horizontal" size={20} color="#374151" />
              </TouchableOpacity>
              {customerId ? (
                <TouchableOpacity
                  onPress={() => setShowCustomOfferSheet(true)}
                  style={twStyle("p-2 rounded-full bg-primary/10")}
                  accessibilityLabel="Send custom offer"
                >
                  <Ionicons name="pricetag-outline" size={20} color={Colors.primary} />
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      </View>

      <KeyboardAvoidingView
        style={[twStyle("flex-1"), { flex: 1 }]}
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 20}
      >
        {loading && !conversation ? (
          <View style={twStyle("flex-1 justify-center py-8")}>
            <LoadingState />
          </View>
        ) : (
          <>
            <FlatList
              {...chatFlatListPerf}
              ref={flatListRef}
              data={allMessages}
              keyExtractor={(m: Message) => m.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                flexGrow: 1,
                paddingHorizontal: screenPadding,
                paddingTop: 12,
                paddingBottom: 220,
              }}
              onContentSizeChange={() => {
                if (!initialScrollDoneRef.current && allMessages.length > 0) {
                  initialScrollDoneRef.current = true;
                  flatListRef.current?.scrollToEnd({ animated: false });
                }
              }}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent;
                const isNearBottom = contentSize.height - layoutMeasurement.height - contentOffset.y < 200;
                setShowScrollToBottom(!isNearBottom);
              }}
              scrollEventThrottle={200}
              ListEmptyComponent={
                <View style={twStyle("py-12 items-center")}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={48}
                    color={Colors.primary}
                  />
                  <Text style={twStyle("text-gray-500 mt-3 text-center")}>
                    No messages yet. Say hello!
                  </Text>
                </View>
              }
              renderItem={({ item: msg }: { item: Message }) => {
                const isMe = msg.sender_type === "provider";
                const offer = msg.attachments?.find(
                  (a): a is CustomOfferAttachment =>
                    !!a && typeof a === "object" && (a as { type?: string }).type === "custom_offer"
                );
                const showOfferCard = !!offer;
                const hasCustomRequest = msg.attachments?.some((a: { type?: string }) => a.type === "custom_request");
                const customRequestAtt = msg.attachments?.find((a: { type?: string }) => a?.type === "custom_request") as
                  | { request_id?: string; id?: string }
                  | undefined;
                const customRequestNavId = customRequestAtt?.request_id ?? customRequestAtt?.id;
                const files = fileLikeAttachments(msg.attachments);
                const hasText = !!(msg.content && msg.content.trim());

                const openOfferDetail = (offerId: string) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/(app)/(tabs)/more/custom-requests/${offerId}` as never);
                };

                const handleWithdrawOffer = (offerId: string) => {
                  Alert.alert(
                    "Withdraw offer",
                    "Are you sure you want to withdraw this offer? The customer will no longer be able to accept it.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Withdraw",
                        style: "destructive",
                        onPress: async () => {
                          const res = await api.post(`/api/provider/custom-requests/${offerId}/withdraw`, {});
                          if (res.error) {
                            Alert.alert("Error", typeof res.error === "string" ? res.error : res.error.message || "Failed to withdraw offer");
                          } else {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            void refresh();
                          }
                        },
                      },
                    ]
                  );
                };

                const renderFileRow = (att: FileLikeAttachment, idx: number) => {
                  const key = `${msg.id}-f-${idx}-${att.name || att.url || idx}`;
                  if (att.expired || !att.url) {
                    return (
                      <View
                        key={key}
                        style={twStyle(
                          `max-w-[85%] rounded-xl px-3 py-2.5 border border-dashed border-gray-300 ${isMe ? "bg-primary/5" : "bg-gray-50"}`
                        )}
                      >
                        <Text style={twStyle(`text-sm ${isMe ? "text-primary" : "text-gray-600"}`)}>
                          {(att.name || "Attachment") + " — no longer available (retention policy)."}
                        </Text>
                      </View>
                    );
                  }
                  if (isImageMime(att.type)) {
                    return (
                      <TouchableOpacity
                        key={key}
                        activeOpacity={0.9}
                        onPress={() => pushInAppBrowser(router, att.url!, att.name || "Image")}
                      >
                        <Image
                          source={{ uri: att.url }}
                          style={{ width: 220, height: 220, borderRadius: 12 }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      </TouchableOpacity>
                    );
                  }
                  if (isVideoMime(att.type)) {
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => pushInAppBrowser(router, att.url!, att.name || "Video")}
                        style={twStyle(
                          `max-w-[85%] rounded-xl px-3 py-3 flex-row items-center border ${isMe ? "border-primary/30 bg-primary/5" : "border-gray-200 bg-white"}`
                        )}
                      >
                        <Ionicons name="videocam-outline" size={22} color={isMe ? Colors.primary : "#6b7280"} style={{ marginRight: 10 }} />
                        <Text style={twStyle("text-sm text-gray-800 flex-1")} numberOfLines={2}>
                          {att.name || "Video — tap to open"}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => pushInAppBrowser(router, att.url!, att.name || "Document")}
                      style={twStyle(
                        `max-w-[85%] rounded-xl px-3 py-3 flex-row items-center border ${isMe ? "border-primary/30 bg-primary/5" : "border-gray-200 bg-white"}`
                      )}
                    >
                      <Ionicons name="document-text-outline" size={22} color={isMe ? Colors.primary : "#6b7280"} style={{ marginRight: 10 }} />
                      <Text style={twStyle("text-sm text-gray-800 flex-1")} numberOfLines={2}>
                        {att.name || "Document — tap to open"}
                      </Text>
                    </TouchableOpacity>
                  );
                };

                return (
                  <View style={twStyle(`mb-3 ${isMe ? "items-end" : "items-start"}`)}>
                    {showOfferCard ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => offer?.offer_id && openOfferDetail(offer.offer_id)}
                        style={twStyle(`max-w-[85%] rounded-2xl overflow-hidden ${
                          isMe ? "rounded-br-sm bg-primary/10 border border-primary/20" : "rounded-bl-sm bg-gray-100 border border-gray-200"
                        }`)}
                      >
                        <View style={twStyle("px-4 pt-3 pb-2")}>
                          <View style={twStyle("flex-row items-center mb-1")}>
                            <Ionicons name="pricetag" size={16} color={isMe ? Colors.primary : "#6b7280"} style={{ marginRight: 8 }} />
                            <Text style={twStyle("text-sm font-semibold text-gray-900")}>Custom offer</Text>
                          </View>
                          {typeof offer?.price === "number" && (
                            <Text style={twStyle("text-base font-medium text-gray-900 mt-0.5")}>
                              {formatCurrency(offer.price, offer.currency ?? getTenantDefaultCurrency())}
                            </Text>
                          )}
                          {offer?.duration_minutes != null && offer.duration_minutes > 0 && (
                            <Text style={twStyle("text-sm text-gray-600 mt-0.5")}>{offer.duration_minutes} min</Text>
                          )}
                          {offer?.preferred_start_at && (
                            <Text style={twStyle("text-sm text-gray-600 mt-0.5")}>
                              {formatDateTime(offer.preferred_start_at)}
                            </Text>
                          )}
                          {offer?.withdrawn ? (
                            <View style={twStyle("mt-2 px-2 py-1 rounded bg-amber-100 self-start")}>
                              <Text style={twStyle("text-xs font-medium text-amber-800")}>Withdrawn</Text>
                            </View>
                          ) : (offer?.expired === true || offer?.status === "expired") ? (
                            <View style={twStyle("mt-2 px-2 py-1 rounded bg-gray-100 self-start")}>
                              <Text style={twStyle("text-xs font-medium text-gray-500")}>Expired</Text>
                            </View>
                          ) : offer?.status === "paid" ? (
                            <View style={twStyle("mt-2 px-2 py-1 rounded bg-emerald-100 self-start")}>
                              <Text style={twStyle("text-xs font-medium text-emerald-800")}>Paid / Booked</Text>
                            </View>
                          ) : isMe && offer?.offer_id && !offer?.withdrawn && offer?.status !== "expired" ? (
                            <TouchableOpacity
                              onPress={() => handleWithdrawOffer(offer.offer_id!)}
                              style={twStyle("mt-2 px-3 py-1.5 rounded-lg bg-amber-500 active:opacity-80")}
                              activeOpacity={0.8}
                            >
                              <Text style={twStyle("text-sm font-medium text-white")}>Withdraw offer</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                        <View style={twStyle("px-4 pb-2 flex-row items-center justify-end")}>
                          <Text style={[twStyle("text-[11px] text-gray-400"), { marginRight: 4 }]}>{formatTime(msg.created_at)}</Text>
                          {isMe ? (
                            <Ionicons
                              name={msg.read_at ? "checkmark-done" : "checkmark"}
                              size={14}
                              color="#6b7280"
                            />
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    ) : null}

                    {hasCustomRequest ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          if (customRequestNavId) {
                            router.push(`/(app)/(tabs)/more/custom-requests/${customRequestNavId}` as never);
                          } else {
                            router.push("/(app)/(tabs)/more/custom-requests" as never);
                          }
                        }}
                        style={twStyle(
                          `max-w-[85%] rounded-xl px-3 py-2 mb-1 border border-blue-100 ${isMe ? "bg-blue-50 self-end" : "bg-blue-50 self-start"}`
                        )}
                        accessibilityRole="button"
                        accessibilityLabel="Open custom request details"
                      >
                        <Text style={twStyle("text-xs font-semibold text-blue-900")}>Custom request</Text>
                        <Text style={twStyle("text-xs text-blue-800 mt-0.5")}>
                          Tap to open the full request in the app{customRequestNavId ? "" : " (inbox)"}.
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    {files.length > 0 ? (
                      <View style={twStyle(`gap-2 ${showOfferCard || hasCustomRequest ? "mt-1" : ""}`)}>
                        {files.map((att, idx) => renderFileRow(att, idx))}
                        {files.length > 0 && !hasText ? (
                          <View style={twStyle("flex-row items-center justify-end mt-0.5")}>
                            <Text style={[twStyle("text-[11px] text-gray-400"), { marginRight: 4 }]}>{formatTime(msg.created_at)}</Text>
                            {isMe ? (
                              <Ionicons
                                name={msg.read_at ? "checkmark-done" : "checkmark"}
                                size={14}
                                color="#6b7280"
                              />
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    {hasText ? (
                      <View
                        style={twStyle(`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                          showOfferCard || files.length > 0 || hasCustomRequest ? "mt-1" : ""
                        } ${isMe ? "rounded-br-sm bg-primary" : "rounded-bl-sm bg-gray-100"}`)}
                      >
                        <Text style={twStyle(`text-[15px] leading-5 ${isMe ? "text-white" : "text-gray-900"}`)}>{msg.content.trim()}</Text>
                        <View style={twStyle("flex-row items-center justify-end mt-1")}>
                          <Text style={[twStyle(`text-[11px] ${isMe ? "text-white/80" : "text-gray-400"}`), { marginRight: 4 }]}>
                            {formatTime(msg.created_at)}
                          </Text>
                          {isMe ? (
                            <Ionicons
                              name={msg.read_at ? "checkmark-done" : "checkmark"}
                              size={14}
                              color={msg.read_at ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)"}
                            />
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              }}
            />

            {/* Scroll to Bottom Button */}
            {showScrollToBottom && (
              <TouchableOpacity
                onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
                style={{
                  position: "absolute",
                  bottom: 76 + insets.bottom,
                  right: 16,
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: Colors.white,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                  elevation: 4,
                  zIndex: 10,
                }}
                accessibilityRole="button"
                accessibilityLabel="Scroll to bottom"
              >
                <Ionicons name="chevron-down" size={24} color={Colors.gray[600]} />
              </TouchableOpacity>
            )}

            {/* §UI-audit 2026-04: bottom safe-area is now part of the
                input row itself (inside KeyboardAvoidingView) so the
                composer stays above the home indicator whether or not
                the keyboard is open. The trailing SafeAreaView below
                was ineffective because it rendered outside KAV. */}
            <View
              style={[
                twStyle("border-t border-gray-100 px-3 flex-row items-end"),
                { paddingTop: 8, paddingBottom: 8 + insets.bottom },
              ]}
            >
              <TouchableOpacity
                onPress={openAttachmentMenu}
                disabled={sending || uploading}
                style={twStyle("w-11 h-11 rounded-full bg-gray-100 items-center justify-center mr-2")}
                accessibilityLabel="Attach photo, video, or document"
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="attach-outline" size={22} color={Colors.primary} />
                )}
              </TouchableOpacity>
              <TextInput
                style={[twStyle("flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-[15px] text-gray-900 max-h-24 bg-gray-50"), { marginRight: 8 }]}
                placeholder="Message..."
                placeholderTextColor="#9ca3af"
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={2000}
                editable={!sending && !uploading}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!message.trim() || sending || uploading}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor:
                    message.trim() && !sending ? Colors.primary : "#e5e7eb",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons
                    name="arrow-up"
                    size={20}
                    color={message.trim() ? "#fff" : "#9ca3af"}
                  />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
      <CustomOfferSheet
        visible={showCustomOfferSheet}
        onClose={() => setShowCustomOfferSheet(false)}
        customerId={customerId ?? ""}
        customerName={conversation?.customer_name}
        conversationId={conversationId}
        onSuccess={() => refresh()}
      />

      {/* Offer Detail Sheet */}
      <Modal
        visible={offerDetailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOfferDetailVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          onPress={() => setOfferDetailVisible(false)}
        >
          <Pressable
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 8,
              paddingBottom: 36,
              maxHeight: "88%",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* drag handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginBottom: 14 }} />
            {/* header */}
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 18 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: "#111827" }}>Custom offer detail</Text>
              <TouchableOpacity onPress={() => setOfferDetailVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {offerDetailLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : !offerDetailData ? (
              <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 20 }}>
                <Text style={{ color: "#6b7280", textAlign: "center" }}>Could not load offer details.</Text>
              </View>
            ) : (() => {
              const d = offerDetailData;
              const req = d.request;
              const isExpired = d.status === "expired";
              const isWithdrawn = d.status === "withdrawn";
              const isPaid = d.status === "paid";
              const isPending = d.status === "pending";

              const formatDate = (iso: string | null | undefined) => {
                if (!iso) return "—";
                return new Date(iso).toLocaleString("en-ZA", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });
              };

              const statusBadge = isWithdrawn
                ? { label: "Withdrawn", bg: "#FEF3C7", text: "#92400E" }
                : isExpired
                ? { label: "Expired", bg: "#F3F4F6", text: "#6B7280" }
                : isPaid
                ? { label: "Paid / Booked", bg: "#DCFCE7", text: "#166534" }
                : d.status === "payment_pending"
                ? { label: "Payment in progress", bg: "#DBEAFE", text: "#1D4ED8" }
                : { label: "Pending customer acceptance", bg: "#EFF6FF", text: "#1E40AF" };

              const locationLabel = req?.location_type === "at_home" ? "At home" : req?.location_type === "at_salon" ? "At salon" : req?.location_type ?? "—";
              const addressParts = [req?.address_line1, req?.address_line2, req?.address_city, req?.address_state, req?.address_postal_code].filter(Boolean);

              return (
                <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                  {/* Status badge */}
                  <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: statusBadge.bg, marginBottom: 16 }}>
                    <Text style={{ color: statusBadge.text, fontSize: 12, fontWeight: "700" }}>{statusBadge.label}</Text>
                  </View>

                  {/* Service name */}
                  {req?.service_name ? (
                    <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 4 }}>{req.service_name}</Text>
                  ) : null}

                  {/* Price */}
                  <Text style={{ fontSize: 28, fontWeight: "800", color: Colors.primary, marginBottom: 4 }}>
                    {formatCurrency(d.price ?? 0, d.currency ?? "")}
                    {typeof d.travel_fee === "number" && d.travel_fee > 0
                      ? `  + ${formatCurrency(d.travel_fee, d.currency ?? "")} travel`
                      : ""}
                  </Text>

                  {/* Description */}
                  {req?.description ? (
                    <Text style={{ color: "#4b5563", fontSize: 14, marginBottom: 14, lineHeight: 20 }}>{req.description}</Text>
                  ) : null}

                  {/* Detail rows */}
                  <View style={{ gap: 12 }}>
                    {d.duration_minutes ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Ionicons name="time-outline" size={16} color="#6b7280" style={{ marginTop: 1 }} />
                        <Text style={{ color: "#374151", fontSize: 14 }}>{d.duration_minutes} min</Text>
                      </View>
                    ) : null}
                    {req?.preferred_start_at ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Ionicons name="calendar-outline" size={16} color="#6b7280" style={{ marginTop: 1 }} />
                        <Text style={{ color: "#374151", fontSize: 14 }}>{formatDate(req.preferred_start_at)}</Text>
                      </View>
                    ) : null}
                    {d.expiration_at ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Ionicons name="hourglass-outline" size={16} color={isExpired ? "#B45309" : "#6b7280"} style={{ marginTop: 1 }} />
                        <Text style={{ color: isExpired ? "#B45309" : "#374151", fontSize: 14 }}>
                          Offer expires: {formatDate(d.expiration_at)}
                        </Text>
                      </View>
                    ) : null}
                    {req?.location_type ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Ionicons name="location-outline" size={16} color="#6b7280" style={{ marginTop: 1 }} />
                        <View>
                          <Text style={{ color: "#374151", fontSize: 14 }}>{locationLabel}</Text>
                          {addressParts.length > 0 ? (
                            <Text style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{addressParts.join(", ")}</Text>
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                    {d.notes ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Ionicons name="document-text-outline" size={16} color="#6b7280" style={{ marginTop: 1 }} />
                        <Text style={{ color: "#374151", fontSize: 14, flex: 1, lineHeight: 20 }}>{d.notes}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Actions */}
                  {isPending && d.id ? (
                    <TouchableOpacity
                      onPress={() => {
                        setOfferDetailVisible(false);
                        setTimeout(() => handleWithdrawOffer(d.id), 300);
                      }}
                      style={{
                        marginTop: 24,
                        borderRadius: 12,
                        backgroundColor: "#F59E0B",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 14,
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Withdraw offer</Text>
                    </TouchableOpacity>
                  ) : null}
                </ScrollView>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
