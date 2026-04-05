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
 Linking } from "react-native";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase/client";
import { Colors } from "@/constants/colors";
import * as Haptics from "expo-haptics";
import { twStyle } from "@/lib/twStyle";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

interface CustomOfferAttachment {
  type: "custom_offer";
  offer_id?: string;
  price?: number;
  currency?: string;
  duration_minutes?: number;
  preferred_start_at?: string | null;
  withdrawn?: boolean;
}

interface Message {
  id: string;
  content: string;
  sender_type: "provider" | "customer";
  created_at: string;
  read_at: string | null;
  attachments?: CustomOfferAttachment[];
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

const initialScrollDone = { current: false };

export default function ChatScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : undefined;

  const [message, setMessage] = useState("");
  const [showCustomOfferSheet, setShowCustomOfferSheet] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const {
    data: conversation,
    loading,
    error: conversationError,
    refresh,
  } = useApi<ConversationDetail>(`/api/provider/conversations/${conversationId}`, {
    enabled: !!conversationId,
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

  // Mark conversation as read when opened
  useEffect(() => {
    if (!conversationId || !conversation) return;
    markRead(`/api/provider/conversations/${conversationId}/mark-read`, {});
  }, [conversationId, conversation?.id, conversation, markRead]);

  // Scroll to bottom on initial load and when new messages arrive
  useEffect(() => {
    if (allMessages.length > 0) {
      const t = setTimeout(
        () =>
          flatListRef.current?.scrollToEnd({
            animated: initialScrollDone.current,
          }),
        100
      );
      initialScrollDone.current = true;
      return () => clearTimeout(t);
    }
  }, [allMessages.length]);

  // Supabase Realtime: live incoming messages and read receipt updates
  useEffect(() => {
    if (!conversationId) return;
    setRealtimeMessages([]);
    const channel = supabase
      .channel(`provider-messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as any;
          if (m.sender_role !== "customer") return;
          setRealtimeMessages((prev) => {
            if (prev.some((p) => p.id === m.id)) return prev;
            const att: CustomOfferAttachment[] = Array.isArray(m.attachments) ? m.attachments : [];
            return [
              ...prev,
              {
                id: m.id,
                content: m.content ?? "",
                sender_type: (m.sender_role === "customer" ? "customer" : "provider") as "provider" | "customer",
                created_at: m.created_at,
                read_at: m.read_at ?? null,
                attachments: att,
              },
            ];
          });
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
          const updated = payload.new as any;
          setRealtimeMessages((prev) =>
            prev.map((msg) =>
              msg.id === updated.id ? { ...msg, read_at: updated.read_at ?? null } : msg
            )
          );
          refresh();
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
  }, [conversationId, refresh]);

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
    }
  }, [message, conversationId, sending, sendMessage, refresh]);

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
        router.push(`/(app)/(tabs)/more/clients/${customerId}` as never);
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
          ...(customerId ? [{ text: "View booking history", onPress: () => router.push(`/(app)/(tabs)/more/clients/${customerId}` as never) }] : []),
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
      <View style={twStyle("border-b border-gray-100 px-4")}>
        <ScreenHeader
          title={conversation?.customer_name ?? "Chat"}
          showBack
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
                const offer = msg.attachments?.find((a: { type?: string }) => a.type === "custom_offer");
                const showOfferCard = !!offer;

                return (
                  <View
                    style={twStyle(`mb-3 ${isMe ? "items-end" : "items-start"}`)}
                  >
                    {showOfferCard ? (
                      <View
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
                          ) : isMe && offer?.offer_id ? (
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
                      </View>
                    ) : null}
                    {(!showOfferCard || !!msg.content) ? (
                      <View
                        style={twStyle(`max-w-[80%] rounded-2xl px-4 py-2.5 ${showOfferCard ? "mt-1" : ""} ${
                          isMe ? "rounded-br-sm bg-primary" : "rounded-bl-sm bg-gray-100"
                        }`)}
                      >
                        <Text
                          style={twStyle(`text-[15px] leading-5 ${isMe ? "text-white" : "text-gray-900"}`)}
                        >
                          {msg.content || " "}
                        </Text>
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

            <View style={twStyle("border-t border-gray-100 px-3 py-2 flex-row items-end")}>
              <TextInput
                style={[twStyle("flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-[15px] text-gray-900 max-h-24 bg-gray-50"), { marginRight: 8 }]}
                placeholder="Message..."
                placeholderTextColor="#9ca3af"
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={2000}
                editable={!sending}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!message.trim() || sending}
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
      <SafeAreaView edges={["bottom"]} />
      <CustomOfferSheet
        visible={showCustomOfferSheet}
        onClose={() => setShowCustomOfferSheet(false)}
        customerId={customerId ?? ""}
        customerName={conversation?.customer_name}
        onSuccess={() => refresh()}
      />
    </SafeAreaView>
  );
}
