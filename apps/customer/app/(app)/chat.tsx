import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { Colors } from "@/constants/colors";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Ionicons } from "@expo/vector-icons";

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  attachments?: { url: string; expired?: boolean; type?: string; name?: string }[] | string[];
  created_at: string;
  is_read?: boolean;
  read_at?: string | null;
}

const PAGE_SIZE = 50;

export default function ChatScreen() {
  useScreenTracking("Chat");
  const { contentPadding } = useResponsive();
  const insets = useSafeAreaInsets();
  // §UI-audit 2026-04: derive the keyboard offset from the real safe
  // area top so notched iPhones / iPads don't get their input bar
  // covered by the keyboard. 44 is the stock native-stack header
  // height on iOS; adding `insets.top` reproduces `useHeaderHeight`
  // closely without pulling in `@react-navigation/elements`.
  const headerHeight = insets.top + 44;
  const params = useLocalSearchParams<{ id?: string; provider_id?: string; provider_name?: string }>();
  const id = params.id;
  const providerId = params.provider_id;
  const providerName = params.provider_name;
  const { user, loading: authLoading, refreshSession } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const didRefreshSession = useRef(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const initialScrollDone = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const { pickFromLibrary } = useImagePicker();

  const loadMessages = useCallback(
    async (cursor?: string) => {
      if (!id) {
        setLoading(false);
        return;
      }
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      setResolveError(null);

      try {
        const queryParams = new URLSearchParams({
          conversation_id: id,
          limit: String(PAGE_SIZE),
        });
        if (cursor) queryParams.set("cursor", cursor);

        const res = await api.get<any>(`/api/me/messages?${queryParams}`);
        if (res.error) {
          if (!cursor) setResolveError(res.error.message || "Could not load messages");
          return;
        }

        const data = res.data;
        const newMessages: Message[] = (data?.messages ?? (Array.isArray(data) ? data : [])).map((m: any) => ({
          ...m,
          is_read: m.is_read,
          read_at: m.read_at ?? null,
        }));

        if (cursor) {
          setMessages((prev) => [...newMessages, ...prev]);
        } else {
          setMessages(newMessages);
        }

        setNextCursor(data?.next_cursor);
        setHasMore(data?.has_more ?? false);
      } catch (err) {
        // §UI-audit 2026-04: previously a thrown exception silently
        // cleared messages with no error UI, so the customer saw an
        // empty thread on network failures. Surface a retryable error.
        if (!cursor) {
          setMessages([]);
          setResolveError(
            err instanceof Error ? err.message : "Could not load messages",
          );
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [id]
  );

  // Resolve provider_id to conversation id (get-or-create) when opening from provider profile
  useEffect(() => {
    if (!user || id || !providerId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post<{ id: string; created?: boolean }>("/api/me/conversations/create", {
          provider_id: providerId,
        });
        if (cancelled) return;
        if (res.error || !res.data?.id) {
          setResolveError(res.error?.message ?? "Could not start conversation");
          setLoading(false);
          return;
        }
        router.replace({ pathname: "/(app)/chat", params: { id: res.data.id } });
      } catch (e) {
        if (!cancelled) {
          setResolveError(e instanceof Error ? e.message : "Could not start conversation");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user, id, providerId]);

  // §UI-audit 2026-04: when `id` changes (e.g. opening a second thread
  // via a push-notification deep link without unmounting this screen),
  // clear the previous conversation's messages + cursor and reset the
  // first-scroll flag so the user never briefly sees the OLD thread
  // while the new payload is in flight.
  useEffect(() => {
    if (!id) return;
    setMessages([]);
    setNextCursor(undefined);
    setHasMore(false);
    initialScrollDone.current = false;
    loadMessages();
  }, [id, loadMessages]);

  // No conversation id and no provider to resolve: invalid navigation
  useEffect(() => {
    if (user && !id && !providerId) {
      setLoading(false);
      setResolveError("Conversation not found");
    }
  }, [user, id, providerId]);

  // Re-sync session when opening chat (e.g. after navigating from another provider) so we don't show "Log in" if session exists in storage
  useEffect(() => {
    if (authLoading || user || didRefreshSession.current) return;
    didRefreshSession.current = true;
    refreshSession();
  }, [authLoading, user, refreshSession]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && messages.length > 0 && !initialScrollDone.current) {
      initialScrollDone.current = true;
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      });
    }
  }, [loading, messages.length]);

  // Mark conversation as read when viewing
  useEffect(() => {
    if (!id || !user) return;
    api.post(`/api/me/conversations/${id}/read`).catch(() => {});
  }, [id, user]);

  // Realtime subscription
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`messages:conversation:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.sender_id === user?.id) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [
              ...prev,
              {
                id: newMsg.id,
                sender_id: newMsg.sender_id,
                sender_name: newMsg.sender_name ?? "Provider",
                content: newMsg.content ?? "",
                attachments: newMsg.attachments ?? [],
                created_at: newMsg.created_at,
                is_read: newMsg.is_read,
                read_at: newMsg.read_at ?? null,
              },
            ];
          });
          requestAnimationFrame(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? { ...m, is_read: updated.is_read, read_at: updated.read_at ?? m.read_at }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // Ignore when channel is still connecting
      }
    };
  }, [id, user?.id]);

  const loadOlder = useCallback(() => {
    if (hasMore && nextCursor && !loadingMore) {
      loadMessages(nextCursor);
    }
  }, [hasMore, nextCursor, loadingMore, loadMessages]);

  const send = async (
    attachments?: {
      url: string;
      type?: string;
      name?: string;
      size?: number;
    }[]
  ) => {
    const text = input.trim();
    if ((!text && (!attachments || attachments.length === 0)) || !id || sending)
      return;
    setSending(true);
    setInput("");

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      sender_id: user?.id || "",
      sender_name: user?.user_metadata?.full_name || "You",
      content: text || (attachments?.length ? "Photo" : ""),
      attachments: attachments,
      created_at: new Date().toISOString(),
      is_read: false,
      read_at: null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });

    try {
      const res = await api.post<Message>("/api/me/messages", {
        conversation_id: id,
        content: text || "",
        attachments: attachments || [],
      });
      if (!res.error && res.data) {
        const msg = res.data as any;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? { ...m, id: msg.id, created_at: msg.created_at }
              : m
          )
        );
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setInput(text);
        const errMsg = (res.error as { message?: string })?.message || "Your message could not be sent. Please try again.";
        Alert.alert("Send failed", errMsg);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(text);
      Alert.alert("Send failed", "Your message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const sendImage = async () => {
    if (!id || sending || uploading) return;
    setUploading(true);
    try {
      const result = await pickFromLibrary();
      if (!result) {
        setUploading(false);
        return;
      }
      const formData = new FormData();
      formData.append("files", {
        uri: result.uri,
        name: result.fileName || "image.jpg",
        type: "image/jpeg",
      } as any);
      formData.append("conversation_id", id);
      const res = await api.post<any>(
        "/api/me/messages/upload",
        formData as any
      );
      if (res.error) {
        Alert.alert("Upload failed", "Could not upload the image. Please try again.");
        return;
      }
      const atts = (res.data as any)?.attachments ?? [];
      if (atts.length > 0) {
        await send(atts);
      } else {
        Alert.alert("Upload failed", "Image uploaded but could not be attached. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  };

  const formatTime = (iso: string) =>
    (() => {
      const parsed = new Date(iso);
      if (!Number.isFinite(parsed.getTime())) return "—";
      return parsed.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    })();

  const formatDateLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dDay = new Date(d);
    dDay.setHours(0, 0, 0, 0);
    if (dDay.getTime() === today.getTime()) return "Today";
    if (dDay.getTime() === yesterday.getTime()) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  type ListItem = { type: "date"; key: string; label: string } | { type: "message"; key: string; message: Message };
  const listItems = useMemo((): ListItem[] => {
    const out: ListItem[] = [];
    let lastDate = "";
    for (const m of messages) {
      const dateKey = new Date(m.created_at).toDateString();
      if (dateKey !== lastDate) {
        lastDate = dateKey;
        out.push({ type: "date", key: `date-${dateKey}`, label: formatDateLabel(m.created_at) });
      }
      out.push({ type: "message", key: m.id, message: m });
    }
    return out;
  }, [messages]);

  if (authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.gray[600], marginTop: 12 }}>Loading…</Text>
      </View>
    );
  }
  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: Colors.gray[600] }}>Log in to view this conversation</Text>
      </View>
    );
  }

  // §UI-audit 2026-04: previously the header title was hardcoded to
  // "Chat" whenever an `id` was present, which meant after a deep-link
  // (or an `/api/me/conversations/create` redirect that drops
  // `provider_name`) the customer lost the partner name. Fall back to
  // the first non-self sender's `sender_name` as a reasonable proxy.
  const partnerFromMessages =
    messages.find((m) => m.sender_id && m.sender_id !== user.id)?.sender_name ?? null;
  const chatTitle =
    providerName || partnerFromMessages || "Chat";

  if (resolveError && messages.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: chatTitle, headerBackTitle: "Back" }} />
        <View style={{ flex: 1, backgroundColor: Colors.white, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color={Colors.gray[300]} />
          <Text style={{ color: Colors.gray[600], marginTop: 12, textAlign: "center" }}>{resolveError}</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: Colors.primary, borderRadius: 12 }}
          >
            <Text style={{ color: Colors.white, fontWeight: "600" }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: chatTitle, headerBackTitle: "Back" }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.white }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
      >
        {loading ? (
          <View style={{ flex: 1 }}>
            <MessageSkeleton />
            <MessageSkeleton isMe />
            <MessageSkeleton />
            <MessageSkeleton isMe />
            <MessageSkeleton />
          </View>
        ) : (
          <>
            <FlatList
              ref={flatListRef}
              data={listItems}
              keyExtractor={(item) => item.key}
              contentContainerStyle={{ padding: contentPadding, paddingBottom: 8 }}
              onScroll={({ nativeEvent }) => {
                if (nativeEvent.contentOffset.y < 80) {
                  loadOlder();
                }
              }}
              scrollEventThrottle={200}
              ListHeaderComponent={
                loadingMore ? (
                  <View style={{ paddingVertical: 12, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                  </View>
                ) : hasMore ? (
                  <TouchableOpacity onPress={loadOlder} style={{ paddingVertical: 12, alignItems: "center" }}>
                    <Text style={{ fontSize: 14, color: Colors.gray[400] }}>Load older messages</Text>
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                <View style={{ paddingVertical: 32, alignItems: "center" }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={48} color={Colors.primary} />
                  <Text style={{ color: Colors.gray[500], marginTop: 12 }}>No messages yet. Say hello!</Text>
                </View>
              }
              renderItem={({ item }) => {
                if (item.type === "date") {
                  return (
                    <View style={{ alignItems: "center", marginVertical: 12 }}>
                      <View style={{ backgroundColor: Colors.gray[100], paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[500] }}>{item.label}</Text>
                      </View>
                    </View>
                  );
                }
                const msg = item.message;
                const isMe = msg.sender_id === user.id;
                const attachmentItems: { url: string; expired?: boolean; name?: string }[] = Array.isArray(
                  msg.attachments
                )
                  ? msg.attachments.map((a: any) =>
                      typeof a === "string" ? { url: a } : { url: a?.url || "", expired: a?.expired, name: a?.name }
                    )
                  : [];
                const hasRenderableAttachments = attachmentItems.some((a) => a.expired || a.url);
                return (
                  <View style={{ marginBottom: 12, alignItems: isMe ? "flex-end" : "flex-start" }}>
                    <View
                      style={{
                        maxWidth: "80%",
                        borderRadius: 16,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        backgroundColor: isMe ? Colors.primary : "#E5E7EB",
                        borderBottomRightRadius: isMe ? 4 : 16,
                        borderBottomLeftRadius: isMe ? 16 : 4,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 2,
                        elevation: 1,
                      }}
                    >
                      {hasRenderableAttachments && (
                        <View style={{ marginBottom: 8 }}>
                          {attachmentItems.map((att, i) =>
                            att.expired || !att.url ? (
                              <Text
                                key={i}
                                style={{
                                  fontSize: 13,
                                  color: isMe ? "rgba(255,255,255,0.85)" : Colors.gray[600],
                                  marginBottom: i < attachmentItems.length - 1 ? 8 : 0,
                                }}
                              >
                                {att.name ? `${att.name} — ` : ""}File no longer available (retention policy).
                              </Text>
                            ) : (
                              <TouchableOpacity
                                key={i}
                                activeOpacity={0.85}
                                onPress={() => setPreviewImageUrl(att.url)}
                                accessibilityRole="imagebutton"
                                accessibilityLabel="Open image preview"
                                style={{
                                  marginBottom: i < attachmentItems.length - 1 ? 8 : 0,
                                }}
                              >
                                <Image
                                  source={{ uri: att.url }}
                                  style={{
                                    width: 192,
                                    height: 192,
                                    borderRadius: 8,
                                  }}
                                  contentFit="cover"
                                  cachePolicy="memory-disk"
                                  transition={200}
                                />
                              </TouchableOpacity>
                            )
                          )}
                        </View>
                      )}
                      {msg.content ? (
                        <Text style={{ color: isMe ? Colors.white : Colors.gray[900], fontSize: 15, lineHeight: 20 }}>
                          {msg.content}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4, justifyContent: "flex-end" }}>
                        <Text style={{ fontSize: 11, color: isMe ? "rgba(255,255,255,0.7)" : Colors.gray[500] }}>
                          {formatTime(msg.created_at)}
                        </Text>
                        {isMe && (msg.is_read || msg.read_at) ? (
                          <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.9)" />
                        ) : isMe ? (
                          <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.6)" />
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              }}
            />

            {/* Input bar — respects the iOS home indicator via `insets.bottom`. */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                borderTopWidth: 1,
                borderTopColor: Colors.gray[100],
                paddingHorizontal: 12,
                paddingTop: 8,
                paddingBottom: 8 + insets.bottom,
              }}
            >
              <TouchableOpacity
                onPress={sendImage}
                disabled={sending || uploading}
                style={{ marginRight: 8, width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center" }}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="camera-outline" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 96 }}
                placeholder="Message..."
                placeholderTextColor="#9ca3af"
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={2000}
              />
              <TouchableOpacity
                onPress={() => send()}
                disabled={(!input.trim() && !uploading) || sending}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor:
                    input.trim() || sending ? Colors.primary : "#e5e7eb",
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
                    color={input.trim() ? "#fff" : "#9ca3af"}
                  />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {/* Image preview modal (attachments) */}
      <Modal
        visible={!!previewImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <Pressable
          onPress={() => setPreviewImageUrl(null)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.92)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
          accessibilityRole="button"
          accessibilityLabel="Close image preview"
        >
          <TouchableOpacity
            onPress={() => setPreviewImageUrl(null)}
            style={{
              position: "absolute",
              top: insets.top + 12,
              right: 16,
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.1)",
            }}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {previewImageUrl ? (
            <Image
              source={{ uri: previewImageUrl }}
              style={{ width: "100%", height: "80%" }}
              contentFit="contain"
              transition={150}
            />
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

function MessageSkeleton({ isMe }: { isMe?: boolean }) {
  return (
    <View
      style={{ marginBottom: 12, paddingHorizontal: 16, alignItems: isMe ? "flex-end" : "flex-start", paddingTop: 8 }}
    >
      <View
        style={{
          width: isMe ? "60%" : "70%",
          height: 48,
          borderRadius: 16,
          backgroundColor: isMe ? "#fce7f3" : "#f3f4f6",
        }}
      />
    </View>
  );
}
