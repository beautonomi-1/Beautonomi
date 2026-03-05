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
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text className="text-gray-600 mt-3">Loading…</Text>
      </View>
    );
  }
  if (!user) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-gray-600">Log in to view this conversation</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Chat", headerBackTitle: "Back" }} />
      <KeyboardAvoidingView
        className="flex-1 bg-white"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        {loading ? (
          <View className="flex-1">
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
              contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
              onScroll={({ nativeEvent }) => {
                if (nativeEvent.contentOffset.y < 80) {
                  loadOlder();
                }
              }}
              scrollEventThrottle={200}
              ListHeaderComponent={
                loadingMore ? (
                  <View className="py-3 items-center">
                    <ActivityIndicator size="small" color={Colors.primary} />
                  </View>
                ) : hasMore ? (
                  <TouchableOpacity
                    onPress={loadOlder}
                    className="py-3 items-center"
                  >
                    <Text className="text-sm text-gray-400">
                      Load older messages
                    </Text>
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                <View className="py-8 items-center">
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={48}
                    color={Colors.primary}
                  />
                  <Text className="text-gray-500 mt-3">
                    No messages yet. Say hello!
                  </Text>
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
                  <View
                    className={`mb-3 ${isMe ? "items-end" : "items-start"}`}
                  >
                    <View
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                        isMe ? "bg-primary rounded-br-md" : "bg-gray-100 rounded-bl-md"
                      }`}
                    >
                      {urls.length > 0 && (
                        <View className="gap-2 mb-2">
                          {urls.map((url: string, i: number) => (
                            <Image
                              key={i}
                              source={{ uri: url }}
                              style={{
                                width: 192,
                                height: 192,
                                borderRadius: 8,
                              }}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              transition={200}
                            />
                          ))}
                        </View>
                      )}
                      {item.content ? (
                        <Text
                          className={
                            isMe ? "text-white text-[15px]" : "text-gray-900 text-[15px]"
                          }
                        >
                          {item.content}
                        </Text>
                      ) : null}
                      <Text
                        className={`text-[11px] mt-1 ${
                          isMe ? "text-white/70" : "text-gray-400"
                        }`}
                      >
                        {formatTime(item.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />

            {/* Input bar */}
            <View
              className="flex-row items-end border-t border-gray-100 px-3 py-2 gap-2"
              style={{ paddingBottom: Platform.OS === "ios" ? 4 : 2 }}
            >
              <TouchableOpacity
                onPress={sendImage}
                disabled={sending || uploading}
                className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="camera-outline" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
              <TextInput
                className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-[15px] max-h-24"
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
      className={`mb-3 px-4 ${isMe ? "items-end" : "items-start"}`}
      style={{ paddingTop: 8 }}
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
