import { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, Stack } from "expo-router";
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
  attachments?: { url: string }[] | string[];
  created_at: string;
}

const PAGE_SIZE = 50;

export default function ChatScreen() {
  useScreenTracking("Chat");
  const { contentPadding } = useResponsive();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, loading: authLoading, refreshSession } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const didRefreshSession = useRef(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const initialScrollDone = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  const { pickFromLibrary } = useImagePicker();

  const loadMessages = useCallback(
    async (cursor?: string) => {
      if (!id) return;
      if (cursor) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams({
          conversation_id: id,
          limit: String(PAGE_SIZE),
        });
        if (cursor) params.set("cursor", cursor);

        const res = await api.get<any>(`/api/me/messages?${params}`);
        if (res.error) {
          setMessages([]);
          return;
        }

        const data = res.data;
        const newMessages: Message[] = data?.messages ?? (Array.isArray(data) ? data : []);

        if (cursor) {
          setMessages((prev) => [...newMessages, ...prev]);
        } else {
          setMessages(newMessages);
        }

        setNextCursor(data?.next_cursor);
        setHasMore(data?.has_more ?? false);
      } catch {
        if (!cursor) setMessages([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [id]
  );

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

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
              },
            ];
          });
          requestAnimationFrame(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          });
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
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(text);
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
      const atts = (res.data as any)?.attachments ?? [];
      if (atts.length > 0) {
        await send(atts);
      }
    } finally {
      setUploading(false);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

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

  return (
    <>
      <Stack.Screen options={{ title: "Chat", headerBackTitle: "Back" }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.white }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
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
              data={messages}
              keyExtractor={(m) => m.id}
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
                const isMe = item.sender_id === user.id;
                const urls = Array.isArray(item.attachments)
                  ? item.attachments
                      .map((a: any) => (typeof a === "string" ? a : a?.url))
                      .filter(Boolean)
                  : [];
                return (
                  <View style={{ marginBottom: 12, alignItems: isMe ? "flex-end" : "flex-start" }}>
                    <View
                      style={{
                        maxWidth: "80%",
                        borderRadius: 16,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        backgroundColor: isMe ? Colors.primary : Colors.gray[100],
                        borderBottomRightRadius: isMe ? 8 : 16,
                        borderBottomLeftRadius: isMe ? 16 : 8,
                      }}
                    >
                      {urls.length > 0 && (
                        <View style={{ marginBottom: 8 }}>
                          {urls.map((url: string, i: number) => (
                            <Image
                              key={i}
                              source={{ uri: url }}
                              style={{
                                width: 192,
                                height: 192,
                                borderRadius: 8,
                                marginBottom: i < urls.length - 1 ? 8 : 0,
                              }}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              transition={200}
                            />
                          ))}
                        </View>
                      )}
                      {item.content ? (
                        <Text style={{ color: isMe ? Colors.white : Colors.gray[900], fontSize: 15 }}>
                          {item.content}
                        </Text>
                      ) : null}
                      <Text style={{ fontSize: 11, marginTop: 4, color: isMe ? "rgba(255,255,255,0.7)" : Colors.gray[400] }}>
                        {formatTime(item.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />

            {/* Input bar */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                borderTopWidth: 1,
                borderTopColor: Colors.gray[100],
                paddingHorizontal: 12,
                paddingVertical: 8,
                paddingBottom: Platform.OS === "ios" ? 4 : 2,
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
