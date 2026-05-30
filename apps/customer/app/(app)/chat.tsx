import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useFocusEffect } from "expo-router";
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
  Linking,
  InteractionManager,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { Colors } from "@/constants/colors";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Ionicons } from "@expo/vector-icons";
import { chatFlatListPerf } from "@/lib/flatListPerformance";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { CustomOfferCard } from "@beautonomi/ui/native";
import { getApiErrorMessage } from "@/lib/api-error";
import { useTranslation, i18n } from "@beautonomi/i18n";

interface MessageReplyTo {
  id: string;
  sender_id: string;
  sender_name: string;
  content_preview: string;
}

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  attachments?: { url: string; expired?: boolean; type?: string; name?: string }[] | string[];
  created_at: string;
  is_read?: boolean;
  read_at?: string | null;
  reply_to_message_id?: string | null;
  reply_to?: MessageReplyTo | null;
}
type MessageAttachment = {
  url?: string;
  expired?: boolean;
  type?: string;
  name?: string;
  offer_id?: string;
  request_id?: string;
  currency?: string;
  price?: number;
  duration_minutes?: number;
  preferred_start_at?: string | null;
  expiration_at?: string | null;
  withdrawn?: boolean;
  status?: string;
  booking_id?: string | null;
};

/** Server truth when message attachment JSON is stale (patch missed / race). */
type OfferStatusOverride = { status: string; booking_id: string | null };

type OfferDetailData = {
  id: string;
  status: string;
  price?: number;
  currency?: string;
  duration_minutes?: number;
  expiration_at?: string | null;
  notes?: string | null;
  travel_fee?: number | null;
  booking_id?: string | null;
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
};
type MessagesListEnvelope = {
  messages?: unknown[];
  next_cursor?: string;
  has_more?: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

function parseApiMessage(m: unknown): Message | null {
  if (!isRecord(m)) return null;
  if (typeof m.id !== "string" || typeof m.sender_id !== "string" || typeof m.created_at !== "string") return null;
  return {
    id: m.id,
    sender_id: m.sender_id,
    sender_name: typeof m.sender_name === "string" ? m.sender_name : "",
    content: typeof m.content === "string" ? m.content : "",
    attachments: Array.isArray(m.attachments) ? (m.attachments as Message["attachments"]) : [],
    created_at: m.created_at,
    is_read: typeof m.is_read === "boolean" ? m.is_read : undefined,
    read_at: m.read_at === null ? null : typeof m.read_at === "string" ? m.read_at : null,
    reply_to_message_id:
      m.reply_to_message_id === null
        ? null
        : typeof m.reply_to_message_id === "string"
          ? m.reply_to_message_id
          : undefined,
    reply_to:
      isRecord(m.reply_to) &&
      typeof m.reply_to.id === "string" &&
      typeof m.reply_to.sender_id === "string"
        ? {
            id: m.reply_to.id,
            sender_id: m.reply_to.sender_id,
            sender_name:
              typeof m.reply_to.sender_name === "string" ? m.reply_to.sender_name : "",
            content_preview:
              typeof m.reply_to.content_preview === "string" ? m.reply_to.content_preview : "",
          }
        : null,
  };
}

function parseMessagesListPayload(data: unknown): { messages: Message[]; next_cursor?: string; has_more: boolean } {
  const rawList: unknown[] = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.messages)
      ? data.messages
      : [];
  const messages = rawList.map(parseApiMessage).filter((x): x is Message => x !== null);
  const env = isRecord(data) && !Array.isArray(data) ? (data as MessagesListEnvelope) : {};
  return {
    messages,
    next_cursor: typeof env.next_cursor === "string" ? env.next_cursor : undefined,
    has_more: Boolean(env.has_more),
  };
}

function parseRealtimeInsert(row: unknown): Message | null {
  if (!isRecord(row)) return null;
  if (typeof row.id !== "string" || typeof row.sender_id !== "string" || typeof row.created_at !== "string") return null;
  return {
    id: row.id,
    sender_id: row.sender_id,
    sender_name:
      typeof row.sender_name === "string" ? row.sender_name : i18n.t("customer.chatScreen.defaultSenderNameProvider"),
    content: typeof row.content === "string" ? row.content : "",
    attachments: Array.isArray(row.attachments) ? (row.attachments as Message["attachments"]) : [],
    created_at: row.created_at,
    is_read: typeof row.is_read === "boolean" ? row.is_read : undefined,
    read_at: row.read_at === null ? null : typeof row.read_at === "string" ? row.read_at : null,
    reply_to_message_id:
      row.reply_to_message_id === null
        ? null
        : typeof row.reply_to_message_id === "string"
          ? row.reply_to_message_id
          : undefined,
  };
}

function parseRealtimeUpdate(row: unknown): { id: string; is_read?: boolean; read_at?: string | null; attachments?: Message["attachments"] } | null {
  if (!isRecord(row) || typeof row.id !== "string") return null;
  return {
    id: row.id,
    is_read: typeof row.is_read === "boolean" ? row.is_read : undefined,
    read_at: row.read_at === null ? null : typeof row.read_at === "string" ? row.read_at : undefined,
    attachments: Array.isArray(row.attachments) ? (row.attachments as Message["attachments"]) : undefined,
  };
}

type NormalizedAttachment = { url: string; expired?: boolean; name?: string; type?: string };
type ConversationSummary = {
  id: string;
  provider_id?: string | null;
  provider_slug?: string | null;
  provider_name?: string | null;
  /**
   * §UI-audit 2026-05: include the nested provider record so the chat
   * header can display the provider's avatar — `/api/me/conversations`
   * returns `provider.thumbnail_url`/`provider.business_name` (see
   * `apps/customer/app/(app)/(tabs)/chats.tsx`), so reuse that shape.
   */
  provider?: { business_name?: string | null; thumbnail_url?: string | null } | null;
};

function normalizeAttachmentForPreview(a: string | Record<string, unknown>): NormalizedAttachment {
  if (typeof a === "string") return { url: a };
  return {
    url: typeof a.url === "string" ? a.url : "",
    expired: typeof a.expired === "boolean" ? a.expired : undefined,
    name: typeof a.name === "string" ? a.name : undefined,
    type: typeof a.type === "string" ? a.type : undefined,
  };
}

function isImageMime(mime?: string): boolean {
  if (!mime || !mime.trim()) return false;
  return /^image\//i.test(mime);
}

function isVideoMime(mime?: string): boolean {
  return /^video\//i.test(mime || "");
}

function urlLooksLikeImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|heic|heif|avif)(\?|$)/i.test(url);
}

/** Prefer inline image preview; PDFs and videos use tap-to-open rows (matches provider app behaviour). */
function attachmentDisplaysAsInlineImage(att: NormalizedAttachment): boolean {
  if (att.expired || !att.url) return false;
  if (isVideoMime(att.type)) return false;
  if (isImageMime(att.type)) return true;
  return !att.type && urlLooksLikeImageUrl(att.url);
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
  const params = useLocalSearchParams<{ id?: string; provider_id?: string; provider_name?: string; booking_id?: string }>();
  const id = params.id;
  const providerId = params.provider_id;
  const providerName = params.provider_name;
  const bookingIdParam = params.booking_id;
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
  const [conversationMeta, setConversationMeta] = useState<ConversationSummary | null>(null);
  const [decliningOfferId, setDecliningOfferId] = useState<string | null>(null);
  const [offerDetailVisible, setOfferDetailVisible] = useState(false);
  const [offerDetailLoading, setOfferDetailLoading] = useState(false);
  const [offerDetailData, setOfferDetailData] = useState<OfferDetailData | null>(null);
  /** Merged into custom_offer bubbles so CTAs match DB after payment even if attachments lag. */
  const [offerStatusById, setOfferStatusById] = useState<Record<string, OfferStatusOverride>>({});
  const initialScrollDone = useRef(false);
  const initialScrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLoadingForScrollRef = useRef(true);
  const offerRehydrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offerStatusByIdRef = useRef(offerStatusById);
  offerStatusByIdRef.current = offerStatusById;
  const flatListRef = useRef<FlatList>(null);
  const messagesRealtimeGenRef = useRef(0);
  const offersRealtimeGenRef = useRef(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const { pickFromLibrary, pickFromCamera } = useImagePicker();
  const { t } = useTranslation();

  useEffect(() => {
    setReplyingTo(null);
  }, [id]);

  const getMessagePreviewText = useCallback((msg: Message): string => {
    const text = (msg.content || "").trim();
    if (text) return text.length > 120 ? `${text.slice(0, 120)}…` : text;
    const att = Array.isArray(msg.attachments) ? msg.attachments[0] : undefined;
    const type =
      att && typeof att === "object" && att !== null && "type" in att
        ? String((att as { type?: string }).type ?? "")
        : "";
    if (type === "custom_offer") return t("customer.chatScreen.customOfferTitle");
    if (type === "custom_request") return t("customer.chatScreen.customRequestLabel");
    if (type === "custom_offer_paid") return t("customer.chatScreen.paymentReceivedBookingConfirmed");
    if (type.startsWith("image/")) return t("customer.chatScreen.attachmentCamera");
    if (type.startsWith("video/")) return t("customer.chatScreen.attachmentVideoTap");
    const name =
      att && typeof att === "object" && att !== null && "name" in att
        ? String((att as { name?: string }).name ?? "")
        : "";
    return name || t("customer.chatScreen.attachmentDocumentTap");
  }, [t]);

  const resolveReplyTo = useCallback(
    (msg: Message, list: Message[]): MessageReplyTo | null => {
      if (msg.reply_to) return msg.reply_to;
      const parentId = msg.reply_to_message_id;
      if (!parentId) return null;
      const parent = list.find((m) => m.id === parentId);
      if (!parent) return null;
      return {
        id: parent.id,
        sender_id: parent.sender_id,
        sender_name:
          parent.sender_name ||
          (parent.sender_id === user?.id ? t("customer.chatScreen.replyingToYou") : providerName || ""),
        content_preview: getMessagePreviewText(parent),
      };
    },
    [getMessagePreviewText, providerName, t, user?.id],
  );

  const openUrlOrAlert = useCallback(
    (url: string) => {
      Linking.openURL(url).catch(() => {
        Alert.alert(t("customer.chatScreen.couldNotOpenTitle"), t("customer.chatScreen.couldNotOpenBody"));
      });
    },
    [t],
  );

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

        const res = await api.get<unknown>(`/api/me/messages?${queryParams}`);
        if (res.error) {
          if (!cursor) setResolveError(getApiErrorMessage(res.error, t("customer.chatScreen.loadMessagesFailed")));
          return;
        }

        const { messages: newMessages, next_cursor, has_more } = parseMessagesListPayload(res.data);

        if (cursor) {
          setMessages((prev) => [...newMessages, ...prev]);
        } else {
          setMessages(newMessages);
        }

        setNextCursor(next_cursor);
        setHasMore(has_more);
      } catch (err) {
        // §UI-audit 2026-04: previously a thrown exception silently
        // cleared messages with no error UI, so the customer saw an
        // empty thread on network failures. Surface a retryable error.
        if (!cursor) {
          setMessages([]);
          setResolveError(err instanceof Error ? err.message : t("customer.chatScreen.loadMessagesFailed"));
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [id, t]
  );

  const bumpInitialScrollToLatest = useCallback(() => {
    if (messages.length === 0 || initialScrollDone.current) return;
    const run = () => flatListRef.current?.scrollToEnd({ animated: false });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        run();
        InteractionManager.runAfterInteractions(() => {
          run();
        });
      });
    });
    if (initialScrollIdleTimerRef.current) clearTimeout(initialScrollIdleTimerRef.current);
    initialScrollIdleTimerRef.current = setTimeout(() => {
      initialScrollIdleTimerRef.current = null;
      initialScrollDone.current = true;
    }, 450);
  }, [messages.length]);

  useEffect(() => {
    if (prevLoadingForScrollRef.current && !loading && messages.length > 0) {
      bumpInitialScrollToLatest();
    }
    prevLoadingForScrollRef.current = loading;
  }, [loading, messages.length, bumpInitialScrollToLatest]);

  // Resolve provider_id to conversation id (get-or-create) when opening from provider profile
  useEffect(() => {
    if (!user || id || !providerId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post<{ id: string; created?: boolean }>("/api/me/conversations/create", {
          provider_id: providerId,
          ...(bookingIdParam ? { booking_id: bookingIdParam } : {}),
        });
        if (cancelled) return;
        if (res.error || !res.data?.id) {
          setResolveError(res.error?.message ?? t("customer.chatScreen.couldNotStartConversation"));
          setLoading(false);
          return;
        }
        router.replace({ pathname: "/(app)/chat", params: { id: res.data.id } });
      } catch (e) {
        if (!cancelled) {
          setResolveError(e instanceof Error ? e.message : t("customer.chatScreen.couldNotStartConversation"));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user, id, providerId, bookingIdParam, t]);

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
    setOfferStatusById({});
    initialScrollDone.current = false;
    prevLoadingForScrollRef.current = true;
    if (initialScrollIdleTimerRef.current) {
      clearTimeout(initialScrollIdleTimerRef.current);
      initialScrollIdleTimerRef.current = null;
    }
    loadMessages();
  }, [id, loadMessages]);

  // No conversation id and no provider to resolve: invalid navigation
  useEffect(() => {
    if (user && !id && !providerId) {
      setLoading(false);
      setResolveError(t("customer.chatScreen.conversationNotFound"));
    }
  }, [user, id, providerId, t]);

  // Re-sync session when opening chat (e.g. after navigating from another provider) so we don't show "Log in" if session exists in storage
  useEffect(() => {
    if (authLoading || user || didRefreshSession.current) return;
    didRefreshSession.current = true;
    refreshSession();
  }, [authLoading, user, refreshSession]);

  // Mark conversation as read when viewing
  useEffect(() => {
    if (!id || !user) return;
    api.post(`/api/me/conversations/${id}/read`).catch(() => {});
    api
      .post("/api/me/notifications/mark-related-read", { conversation_id: id })
      .catch(() => {});
  }, [id, user]);

  // Re-fetch offer rows for bubbles stuck on pending / payment_pending (attachment patch can lag).
  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    if (offerRehydrateTimerRef.current) clearTimeout(offerRehydrateTimerRef.current);
    offerRehydrateTimerRef.current = setTimeout(() => {
      offerRehydrateTimerRef.current = null;
      const offerIds = new Set<string>();
      for (const m of messages) {
        if (!Array.isArray(m.attachments)) continue;
        for (const raw of m.attachments) {
          if (typeof raw !== "object" || !raw) continue;
          const a = raw as MessageAttachment;
          if (a.type !== "custom_offer" || !a.offer_id) continue;
          const st = (a.status || "").toLowerCase();
          if (st === "pending" || st === "payment_pending" || !st) {
            const known = offerStatusByIdRef.current[a.offer_id];
            const knownSt = (known?.status ?? "").toLowerCase();
            if (
              knownSt === "paid" ||
              knownSt === "declined" ||
              knownSt === "withdrawn" ||
              knownSt === "expired" ||
              knownSt === "finalize_failed"
            ) {
              continue;
            }
            offerIds.add(a.offer_id);
          }
        }
      }
      if (offerIds.size === 0 || cancelled) return;
      void (async () => {
        const patch: Record<string, OfferStatusOverride> = {};
        await Promise.all(
          [...offerIds].map(async (oid) => {
            try {
              const res = await api.get<{ status?: string; booking_id?: string | null }>(
                `/api/me/custom-offers/${encodeURIComponent(oid)}`,
              );
              if (cancelled || res.error || !res.data?.status) return;
              const row = res.data;
              patch[oid] = { status: row.status!, booking_id: row.booking_id ?? null };
            } catch {
              /* ignore */
            }
          }),
        );
        if (!cancelled && Object.keys(patch).length > 0) {
          setOfferStatusById((prev) => ({ ...prev, ...patch }));
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      if (offerRehydrateTimerRef.current) {
        clearTimeout(offerRehydrateTimerRef.current);
        offerRehydrateTimerRef.current = null;
      }
    };
  }, [id, user, messages]);

  // Resolve conversation metadata (provider id/slug/name) when opening by conversation id.
  useEffect(() => {
    if (!id || providerId) return;
    let cancelled = false;
    (async () => {
      const res = await api.get<ConversationSummary[] | { data?: ConversationSummary[] }>("/api/me/conversations");
      if (cancelled || res.error) return;
      const list = Array.isArray(res.data)
        ? res.data
        : ((res.data as { data?: ConversationSummary[] })?.data ?? []);
      const found = list.find((c) => c.id === id) ?? null;
      if (!cancelled) setConversationMeta(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, providerId]);

  // Realtime subscription
  useEffect(() => {
    if (!id) return;
    const gen = ++messagesRealtimeGenRef.current;
    const channel = supabase
      .channel(`messages:conversation:${id}:rt${gen}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const newMsg = parseRealtimeInsert(payload.new);
          if (!newMsg || newMsg.sender_id === user?.id) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            const parentId = newMsg.reply_to_message_id;
            let reply_to = newMsg.reply_to ?? null;
            if (!reply_to && parentId) {
              const parent = prev.find((m) => m.id === parentId);
              if (parent) {
                reply_to = {
                  id: parent.id,
                  sender_id: parent.sender_id,
                  sender_name: parent.sender_name,
                  content_preview: (parent.content || "").trim().slice(0, 120) || "Attachment",
                };
              }
            }
            return [...prev, { ...newMsg, reply_to }];
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
          const updated = parseRealtimeUpdate(payload.new);
          if (!updated) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? {
                    ...m,
                    is_read: updated.is_read ?? m.is_read,
                    read_at: updated.read_at ?? m.read_at,
                    attachments: updated.attachments ?? m.attachments,
                  }
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

  // Subscribe to custom_offers status changes so offer cards update in realtime
  // without waiting for patchCustomOfferMessageAttachments to UPDATE the message row.
  // RLS ensures we only receive rows the customer can read.
  useEffect(() => {
    if (!id || !user?.id) return;
    const gen = ++offersRealtimeGenRef.current;
    const topic = `customer-offer-status:${id}:rt${gen}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes" as never,
        { event: "UPDATE", schema: "public", table: "custom_offers" },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new;
          const oid = typeof row.id === "string" ? row.id : null;
          const status = typeof row.status === "string" ? row.status : null;
          const bookingId =
            row.booking_id === null ? null : typeof row.booking_id === "string" ? row.booking_id : null;
          if (!oid || !status) return;
          // Only update if we're actually tracking this offer in the current conversation.
          setOfferStatusById((prev) => {
            // Always accept if we already track it, or if status is a terminal one.
            if (!(oid in prev) && status === "pending") return prev;
            return { ...prev, [oid]: { status, booking_id: bookingId } };
          });
        },
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

  // Re-trigger the offer rehydrate when the user returns to the chat screen
  // so status is always fresh after navigating to checkout and back.
  useFocusEffect(
    useCallback(() => {
      if (!id || !user) return;
      // Trigger the debounced rehydrate by touching offerStatusById would
      // cause an infinite loop; instead force a fast one-shot fetch of all
      // pending offers currently shown.
      const offerIds = new Set<string>();
      for (const m of messages) {
        if (!Array.isArray(m.attachments)) continue;
        for (const raw of m.attachments) {
          if (typeof raw !== "object" || !raw) continue;
          const a = raw as MessageAttachment;
          if (a.type !== "custom_offer" || !a.offer_id) continue;
          const st = (a.status || "").toLowerCase();
          const known = offerStatusByIdRef.current[a.offer_id];
          const knownSt = (known?.status ?? "").toLowerCase();
          if (
            knownSt === "paid" ||
            knownSt === "declined" ||
            knownSt === "withdrawn" ||
            knownSt === "expired" ||
            knownSt === "finalize_failed"
          )
            continue;
          if (st === "pending" || st === "payment_pending" || !st) {
            offerIds.add(a.offer_id);
          }
        }
      }
      if (offerIds.size === 0) return;
      void (async () => {
        const patch: Record<string, OfferStatusOverride> = {};
        await Promise.all(
          [...offerIds].map(async (oid) => {
            try {
              const res = await api.get<{ status?: string; booking_id?: string | null }>(
                `/api/me/custom-offers/${encodeURIComponent(oid)}`,
              );
              if (res.error || !res.data?.status) return;
              patch[oid] = { status: res.data.status, booking_id: res.data.booking_id ?? null };
            } catch {
              /* ignore */
            }
          }),
        );
        if (Object.keys(patch).length > 0) {
          setOfferStatusById((prev) => ({ ...prev, ...patch }));
        }
      })();
    }, [id, user, messages]),
  );

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
    const replyTarget = replyingTo;
    setReplyingTo(null);

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      sender_id: user?.id || "",
      sender_name: user?.user_metadata?.full_name || t("customer.chatScreen.senderNameYou"),
      content: text || (attachments?.length ? t("customer.chatScreen.optimisticAttachmentLabel") : ""),
      attachments: attachments,
      created_at: new Date().toISOString(),
      is_read: false,
      read_at: null,
      reply_to_message_id: replyTarget?.id ?? null,
      reply_to: replyTarget
        ? {
            id: replyTarget.id,
            sender_id: replyTarget.sender_id,
            sender_name:
              replyTarget.sender_id === user?.id
                ? t("customer.chatScreen.replyingToYou")
                : replyTarget.sender_name,
            content_preview: getMessagePreviewText(replyTarget),
          }
        : null,
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
        ...(replyTarget?.id ? { reply_to_message_id: replyTarget.id } : {}),
      });
      if (!res.error && res.data) {
        const msg = res.data;
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
        if (replyTarget) setReplyingTo(replyTarget);
        Alert.alert(
          t("customer.chatScreen.sendFailedTitle"),
          getApiErrorMessage(res.error, t("customer.chatScreen.sendFailedBody")),
        );
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(text);
      if (replyTarget) setReplyingTo(replyTarget);
      Alert.alert(
        t("customer.chatScreen.sendFailedTitle"),
        t("customer.chatScreen.sendFailedBody"),
      );
    } finally {
      setSending(false);
    }
  };

  // §UI-audit 2026-05: extracted the upload pipeline so both image
  // picking and document picking share the same FormData + retry path.
  const uploadAndSendFile = async (file: { uri: string; name: string; type: string }) => {
    if (!id) return;
    const formData = new FormData();
    formData.append("conversation_id", id);
    appendFormDataFileNative(formData, "files", {
      uri: file.uri,
      name: file.name,
      type: file.type || "application/octet-stream",
    });
    const res = await api.fetch<{ attachments?: Message["attachments"] }>("/api/me/messages/upload", {
      method: "POST",
      body: formData,
    });
    if (res.error) {
      const isImage = file.type?.startsWith("image/");
      Alert.alert(
        t("customer.chatScreen.uploadFailedTitle"),
        getApiErrorMessage(
          res.error,
          isImage
            ? t("customer.chatScreen.uploadFailedBody")
            : t("customer.chatScreen.documentUploadFailedBody"),
        ),
      );
      return;
    }
    const payload = res.data as { attachments?: Message["attachments"] } | null;
    const atts = (payload?.attachments ?? []) as NonNullable<Parameters<typeof send>[0]>;
    if (atts.length > 0) {
      await send(atts);
    } else {
      Alert.alert(
        t("customer.chatScreen.uploadFailedTitle"),
        t("customer.chatScreen.uploadFailedAttach"),
      );
    }
  };

  const sendImage = async (source: "camera" | "library") => {
    if (!id || sending || uploading) return;
    setUploading(true);
    try {
      const result = source === "camera" ? await pickFromCamera() : await pickFromLibrary();
      if (!result) {
        setUploading(false);
        return;
      }
      await uploadAndSendFile({
        uri: result.uri,
        name: result.fileName || "image.jpg",
        type: result.mimeType || "image/jpeg",
      });
    } finally {
      setUploading(false);
    }
  };

  const sendDocument = async () => {
    if (!id || sending || uploading) return;
    setUploading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/plain",
          "image/*",
        ],
      });
      if (result.canceled) {
        setUploading(false);
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setUploading(false);
        return;
      }
      await uploadAndSendFile({
        uri: asset.uri,
        name: asset.name || "document",
        type: asset.mimeType || "application/octet-stream",
      });
    } finally {
      setUploading(false);
    }
  };

  const chooseAttachmentSource = () => {
    if (Platform.OS === "web") {
      void sendDocument();
      return;
    }
    Alert.alert(
      t("customer.chatScreen.attachmentSheetTitle"),
      t("customer.chatScreen.attachmentSheetBody"),
      [
        { text: t("customer.chatScreen.attachmentCamera"), onPress: () => void sendImage("camera") },
        { text: t("customer.chatScreen.attachmentLibrary"), onPress: () => void sendImage("library") },
        { text: t("customer.chatScreen.attachmentDocument"), onPress: () => void sendDocument() },
        { text: t("common.cancel"), style: "cancel" },
      ],
    );
  };

  const declineCustomOffer = useCallback(
    async (offerId: string) => {
      Alert.alert(
        t("customer.chatScreen.declineOfferTitle"),
        t("customer.chatScreen.declineOfferBody"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("customer.chatScreen.declineOfferConfirm"),
            style: "destructive",
            onPress: async () => {
              setDecliningOfferId(offerId);
              try {
                const res = await api.post(`/api/me/custom-offers/${offerId}/decline`, {});
                if (res.error) {
                  Alert.alert(
                    t("customer.chatScreen.offerActionFailedTitle"),
                    getApiErrorMessage(res.error, t("customer.chatScreen.declineOfferFailed")),
                  );
                  return;
                }
                await loadMessages();
              } finally {
                setDecliningOfferId(null);
              }
            },
          },
        ],
      );
    },
    [loadMessages, t],
  );

  const openOfferDetail = useCallback(async (offerId: string) => {
    setOfferDetailData(null);
    setOfferDetailVisible(true);
    setOfferDetailLoading(true);
    try {
      const res = await api.get<OfferDetailData>(`/api/me/custom-offers/${offerId}`);
      if (res.data) setOfferDetailData(res.data);
    } catch {
      // leave null — modal shows error state
    } finally {
      setOfferDetailLoading(false);
    }
  }, []);

  const openAcceptOfferOptions = useCallback(
    (oid: string) => {
      router.push({
        pathname: "/(app)/custom-offer-checkout",
        params: { offer_id: oid },
      } as never);
    },
    [router],
  );

  const formatTime = (iso: string) =>
    (() => {
      const parsed = new Date(iso);
      if (!Number.isFinite(parsed.getTime())) return t("customer.chatScreen.emDash");
      return parsed.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    })();

  const formatDateLabel = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dDay = new Date(d);
      dDay.setHours(0, 0, 0, 0);
      if (dDay.getTime() === today.getTime()) return t("customer.chatScreen.today");
      if (dDay.getTime() === yesterday.getTime()) return t("customer.chatScreen.yesterday");
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    },
    [t],
  );

  const currentUserId = user?.id ?? null;

  type ListItem =
    | { type: "date"; key: string; label: string }
    | { type: "unread"; key: string }
    | { type: "message"; key: string; message: Message };
  const listItems = useMemo((): ListItem[] => {
    const out: ListItem[] = [];
    let lastDate = "";
    let unreadInserted = false;
    for (const m of messages) {
      const dateKey = new Date(m.created_at).toDateString();
      if (dateKey !== lastDate) {
        lastDate = dateKey;
        out.push({ type: "date", key: `date-${dateKey}`, label: formatDateLabel(m.created_at) });
      }
      if (!unreadInserted && currentUserId && m.sender_id !== currentUserId && m.is_read === false) {
        out.push({ type: "unread", key: `unread-${m.id}` });
        unreadInserted = true;
      }
      out.push({ type: "message", key: m.id, message: m });
    }
    return out;
  }, [currentUserId, messages, formatDateLabel]);

  // §UI-audit 2026-04: previously the header title was hardcoded to
  // "Chat" whenever an `id` was present, which meant after a deep-link
  // (or an `/api/me/conversations/create` redirect that drops
  // `provider_name`) the customer lost the partner name. Fall back to
  // the first non-self sender's `sender_name` as a reasonable proxy.
  // §Hooks-rule: derived values + the header `useCallback` MUST run on
  // every render, so they live above the early returns below.
  const partnerFromMessages =
    messages.find((m) => m.sender_id && user?.id && m.sender_id !== user.id)?.sender_name ?? null;
  const resolvedProviderId = providerId || conversationMeta?.provider_id || null;
  const resolvedProviderSlug = conversationMeta?.provider_slug || null;
  const chatTitle =
    providerName ||
    conversationMeta?.provider_name ||
    conversationMeta?.provider?.business_name ||
    partnerFromMessages ||
    t("customer.chatScreen.fallbackTitle");
  const providerThumbnail = conversationMeta?.provider?.thumbnail_url ?? null;

  // §UI-audit 2026-05: render the provider's avatar next to the title
  // in the chat header so the customer can confirm they're chatting with
  // the right business — the chats list shows the avatar but, until
  // now, the in-thread header was a plain title only. Falls back to an
  // initial chip when no thumbnail is available.
  const renderHeaderTitle = useCallback(() => {
    const initial = chatTitle.charAt(0).toUpperCase();
    return (
      <TouchableOpacity
        onPress={() => {
          if (resolvedProviderSlug) {
            router.push({
              pathname: "/(app)/partner-profile",
              params: { slug: resolvedProviderSlug, provider_id: resolvedProviderId || undefined },
            });
          }
        }}
        disabled={!resolvedProviderSlug}
        style={{ flexDirection: "row", alignItems: "center", maxWidth: 220 }}
        accessibilityRole="button"
        accessibilityLabel={chatTitle}
      >
        {providerThumbnail ? (
          <Image
            source={{ uri: providerThumbnail }}
            style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8, backgroundColor: Colors.gray[100] }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              marginRight: 8,
              backgroundColor: Colors.gray[200],
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: Colors.gray[600], fontWeight: "600", fontSize: 13 }}>{initial}</Text>
          </View>
        )}
        <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }} numberOfLines={1}>
          {chatTitle}
        </Text>
      </TouchableOpacity>
    );
  }, [chatTitle, providerThumbnail, resolvedProviderSlug, resolvedProviderId]);

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
        <Text style={{ color: Colors.gray[600] }}>{t("customer.chatScreen.loginToView")}</Text>
      </View>
    );
  }

  if (resolveError && messages.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{ title: chatTitle, headerTitle: renderHeaderTitle, headerBackTitle: "Back" }}
        />
        <View style={{ flex: 1, backgroundColor: Colors.white, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color={Colors.gray[300]} />
          <Text style={{ color: Colors.gray[600], marginTop: 12, textAlign: "center" }}>{resolveError}</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: Colors.primary, borderRadius: 12 }}
          >
            <Text style={{ color: Colors.white, fontWeight: "600" }}>{t("common.back")}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{ title: chatTitle, headerTitle: renderHeaderTitle, headerBackTitle: "Back" }}
      />
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
            {(resolvedProviderId || resolvedProviderSlug) && (
              <View
                style={{
                  marginHorizontal: contentPadding,
                  marginTop: 8,
                  marginBottom: 4,
                  padding: 10,
                  borderRadius: 12,
                  backgroundColor: Colors.gray[50],
                  borderWidth: 1,
                  borderColor: Colors.gray[100],
                }}
              >
                <Text style={{ color: Colors.gray[700], fontSize: 13, marginBottom: 8 }}>
                  Manage requests and profile details for this provider.
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {resolvedProviderSlug ? (
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: "/(app)/partner-profile",
                          params: { slug: resolvedProviderSlug, provider_id: resolvedProviderId || undefined },
                        })
                      }
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200] }}
                    >
                      <Text style={{ color: Colors.gray[800], fontSize: 12, fontWeight: "600" }}>View Profile</Text>
                    </TouchableOpacity>
                  ) : null}
                  {resolvedProviderId ? (
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: "/(app)/custom-request-create",
                          params: { provider_id: resolvedProviderId },
                        })
                      }
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.primary }}
                    >
                      <Text style={{ color: Colors.white, fontSize: 12, fontWeight: "600" }}>New Request</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => router.push("/(app)/account-settings/custom-requests")}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray[200] }}
                  >
                    <Text style={{ color: Colors.gray[800], fontSize: 12, fontWeight: "600" }}>My Requests</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <FlatList
              {...chatFlatListPerf}
              key={id ?? "none"}
              ref={flatListRef}
              data={listItems}
              keyExtractor={(item) => item.key}
              contentContainerStyle={{ padding: contentPadding, paddingBottom: 8 }}
              onContentSizeChange={() => {
                bumpInitialScrollToLatest();
              }}
              onScroll={({ nativeEvent }) => {
                if (nativeEvent.contentOffset.y < 80) {
                  loadOlder();
                }
                const isNearBottom = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y < 200;
                setShowScrollToBottom(!isNearBottom);
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
                if (item.type === "unread") {
                  return (
                    <View style={{ alignItems: "center", marginVertical: 10 }}>
                      <View style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: "#FCD34D" }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#92400E" }}>Unread messages</Text>
                      </View>
                    </View>
                  );
                }
                const msg = item.message;
                const isMe = msg.sender_id === user.id;
                type Att = NonNullable<Message["attachments"]>[number];
                const attachmentItems: NormalizedAttachment[] = Array.isArray(msg.attachments)
                  ? msg.attachments
                      .filter((a: Att) => {
                        if (typeof a === "string") return true;
                        const t = (a as Record<string, unknown>).type;
                        return t !== "custom_offer" && t !== "custom_request" && t !== "custom_offer_paid";
                      })
                      .map((a: Att) =>
                        normalizeAttachmentForPreview(typeof a === "string" ? a : (a as Record<string, unknown>)),
                      )
                  : [];
                const attachmentRecords: MessageAttachment[] = Array.isArray(msg.attachments)
                  ? msg.attachments
                      .map((a: Att) => (typeof a === "string" ? null : (a as MessageAttachment)))
                      .filter((a: MessageAttachment | null): a is MessageAttachment => !!a)
                  : [];
                const customOfferAttachment = attachmentRecords.find((a) => a.type === "custom_offer");
                const customRequestAttachment = attachmentRecords.find((a) => a.type === "custom_request");
                const customOfferPaidAttachment = attachmentRecords.find((a) => a.type === "custom_offer_paid");
                const hasRenderableAttachments = attachmentItems.some((a) => a.expired || a.url);
                const quotedReply = resolveReplyTo(msg, messages);
                return (
                  <View style={{ marginBottom: 12, alignItems: isMe ? "flex-end" : "flex-start" }}>
                    <Pressable
                      onLongPress={() => setReplyingTo(msg)}
                      delayLongPress={280}
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
                      accessibilityLabel={t("customer.chatScreen.replyToMessage")}
                    >
                      {quotedReply ? (
                        <Pressable
                          onPress={() => {
                            const idx = listItems.findIndex(
                              (li) => li.type === "message" && li.message.id === quotedReply.id,
                            );
                            if (idx >= 0) flatListRef.current?.scrollToIndex({ index: idx, animated: true });
                          }}
                          style={{
                            marginBottom: 8,
                            paddingLeft: 8,
                            borderLeftWidth: 3,
                            borderLeftColor: isMe ? "rgba(255,255,255,0.85)" : Colors.primary,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "700",
                              color: isMe ? Colors.white : Colors.primary,
                            }}
                            numberOfLines={1}
                          >
                            {quotedReply.sender_name}
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: isMe ? "rgba(255,255,255,0.85)" : Colors.gray[600],
                            }}
                            numberOfLines={2}
                          >
                            {quotedReply.content_preview}
                          </Text>
                        </Pressable>
                      ) : null}
                      {hasRenderableAttachments && (
                        <View style={{ marginBottom: 8 }}>
                          {attachmentItems.map((att, i) => {
                            const key = `${msg.id}-att-${i}`;
                            const gap = i < attachmentItems.length - 1 ? 8 : 0;
                            if (att.expired || !att.url) {
                              return (
                                <Text
                                  key={key}
                                  style={{
                                    fontSize: 13,
                                    color: isMe ? "rgba(255,255,255,0.85)" : Colors.gray[600],
                                    marginBottom: gap,
                                  }}
                                >
                                  {att.name
                                    ? t("customer.chatScreen.attachmentExpiredNamed", { name: att.name })
                                    : t("customer.chatScreen.attachmentExpired")}
                                </Text>
                              );
                            }
                            if (attachmentDisplaysAsInlineImage(att)) {
                              return (
                                <TouchableOpacity
                                  key={key}
                                  activeOpacity={0.85}
                                  onPress={() => setPreviewImageUrl(att.url)}
                                  accessibilityRole="imagebutton"
                                  accessibilityLabel={t("customer.chatScreen.a11yOpenImagePreview")}
                                  style={{ marginBottom: gap }}
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
                              );
                            }
                            if (isVideoMime(att.type)) {
                              return (
                                <TouchableOpacity
                                  key={key}
                                  onPress={() => openUrlOrAlert(att.url)}
                                  accessibilityRole="button"
                                  accessibilityLabel={t("customer.chatScreen.a11yOpenVideo")}
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    maxWidth: "100%",
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: isMe ? "rgba(255,255,255,0.35)" : Colors.gray[200],
                                    backgroundColor: isMe ? "rgba(255,255,255,0.12)" : Colors.white,
                                    marginBottom: gap,
                                  }}
                                >
                                  <Ionicons
                                    name="videocam-outline"
                                    size={22}
                                    color={isMe ? "#fff" : Colors.gray[600]}
                                    style={{ marginRight: 10 }}
                                  />
                                  <Text
                                    style={{
                                      flex: 1,
                                      fontSize: 14,
                                      color: isMe ? "#fff" : Colors.gray[800],
                                    }}
                                    numberOfLines={2}
                                  >
                                    {att.name || t("customer.chatScreen.attachmentVideoTap")}
                                  </Text>
                                </TouchableOpacity>
                              );
                            }
                            return (
                              <TouchableOpacity
                                key={key}
                                onPress={() => openUrlOrAlert(att.url)}
                                accessibilityRole="button"
                                accessibilityLabel={t("customer.chatScreen.a11yOpenAttachment")}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  maxWidth: "100%",
                                  paddingVertical: 10,
                                  paddingHorizontal: 12,
                                  borderRadius: 12,
                                  borderWidth: 1,
                                  borderColor: isMe ? "rgba(255,255,255,0.35)" : Colors.gray[200],
                                  backgroundColor: isMe ? "rgba(255,255,255,0.12)" : Colors.white,
                                  marginBottom: gap,
                                }}
                              >
                                <Ionicons
                                  name="document-text-outline"
                                  size={22}
                                  color={isMe ? "#fff" : Colors.gray[600]}
                                  style={{ marginRight: 10 }}
                                />
                                <Text
                                  style={{
                                    flex: 1,
                                    fontSize: 14,
                                    color: isMe ? "#fff" : Colors.gray[800],
                                  }}
                                  numberOfLines={2}
                                >
                                  {att.name || t("customer.chatScreen.attachmentDocumentTap")}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                      {msg.content ? (
                        <Text style={{ color: isMe ? Colors.white : Colors.gray[900], fontSize: 15, lineHeight: 20 }}>
                          {msg.content}
                        </Text>
                      ) : null}
                      {customOfferAttachment ? (
                        <CustomOfferCard
                          attachment={customOfferAttachment}
                          statusOverride={customOfferAttachment.offer_id ? offerStatusById[customOfferAttachment.offer_id] : undefined}
                          isMe={isMe}
                          role="customer"
                          style={{ marginTop: msg.content ? 10 : 0 }}
                          onPress={() => customOfferAttachment.offer_id && openOfferDetail(customOfferAttachment.offer_id)}
                          onAccept={() => customOfferAttachment.offer_id && openAcceptOfferOptions(customOfferAttachment.offer_id)}
                          onDecline={() => customOfferAttachment.offer_id && void declineCustomOffer(customOfferAttachment.offer_id)}
                          onResume={() => customOfferAttachment.offer_id && openAcceptOfferOptions(customOfferAttachment.offer_id)}
                          onViewBooking={() => {
                            const oid = customOfferAttachment.offer_id ?? "";
                            const ov = oid ? offerStatusById[oid] : undefined;
                            const bid = ov?.booking_id ?? customOfferAttachment.booking_id ?? null;
                            if (bid) router.push({ pathname: "/(app)/booking-detail", params: { id: bid } });
                          }}
                        />
                      ) : null}
                      {customOfferPaidAttachment ? (
                        <View
                          style={{
                            marginTop: msg.content ? 10 : 0,
                            borderRadius: 12,
                            padding: 10,
                            backgroundColor: isMe ? "rgba(255,255,255,0.14)" : "#ECFDF5",
                            borderWidth: 1,
                            borderColor: isMe ? "rgba(255,255,255,0.3)" : "#A7F3D0",
                          }}
                        >
                          <Text style={{ color: isMe ? Colors.white : "#065F46", fontSize: 12, fontWeight: "700" }}>
                            {t("customer.chatScreen.paymentReceivedBookingConfirmed")}
                          </Text>
                          {customOfferPaidAttachment.booking_id ? (
                            <TouchableOpacity
                              onPress={() => router.push({ pathname: "/(app)/booking-detail", params: { id: customOfferPaidAttachment.booking_id! } })}
                              style={{ marginTop: 8, alignSelf: "flex-start" }}
                            >
                              <Text style={{ color: isMe ? Colors.white : Colors.primary, fontSize: 12, fontWeight: "600" }}>
                                {t("customer.chatScreen.customOfferPaidViewBooking")}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                      {customRequestAttachment ? (
                        <View
                          style={{
                            marginTop: msg.content ? 10 : 0,
                            borderRadius: 12,
                            padding: 10,
                            backgroundColor: isMe ? "rgba(255,255,255,0.14)" : Colors.gray[50],
                            borderWidth: 1,
                            borderColor: isMe ? "rgba(255,255,255,0.3)" : Colors.gray[200],
                          }}
                        >
                          <Text style={{ color: isMe ? Colors.white : Colors.gray[900], fontSize: 12, fontWeight: "700" }}>
                            {t("customer.chatScreen.customRequestLabel")}
                          </Text>
                          <TouchableOpacity
                            onPress={() => router.push("/(app)/account-settings/custom-requests")}
                            style={{ marginTop: 8, alignSelf: "flex-start" }}
                          >
                            <Text style={{ color: isMe ? Colors.white : Colors.primary, fontSize: 12, fontWeight: "600" }}>
                              {t("customer.chatScreen.openCustomRequests")}
                            </Text>
                          </TouchableOpacity>
                        </View>
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
                    </Pressable>
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

            {replyingTo ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  borderTopWidth: 1,
                  borderTopColor: Colors.gray[200],
                  backgroundColor: Colors.gray[50],
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <View
                  style={{
                    width: 3,
                    alignSelf: "stretch",
                    backgroundColor: Colors.primary,
                    borderRadius: 2,
                    marginRight: 10,
                  }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.primary }} numberOfLines={1}>
                    {replyingTo.sender_id === user?.id
                      ? t("customer.chatScreen.replyingToYou")
                      : replyingTo.sender_name}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[600] }} numberOfLines={2}>
                    {getMessagePreviewText(replyingTo)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setReplyingTo(null)}
                  accessibilityLabel={t("customer.chatScreen.cancelReply")}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="close" size={20} color={Colors.gray[500]} />
                </TouchableOpacity>
              </View>
            ) : null}

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
                onPress={chooseAttachmentSource}
                disabled={sending || uploading}
                style={{ marginRight: 8, width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center" }}
                accessibilityRole="button"
                accessibilityLabel={t("customer.chatScreen.attachmentSheetTitle")}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="attach" size={22} color={Colors.primary} />
                )}
              </TouchableOpacity>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 96 }}
                placeholder={t("customer.chatScreen.messagePlaceholder")}
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
          accessibilityLabel={t("customer.chatScreen.a11yCloseImagePreview")}
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
            accessibilityLabel={t("common.close")}
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

      {/* Custom Offer Detail Sheet */}
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
              backgroundColor: Colors.white,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 8,
              paddingBottom: 36,
              maxHeight: "88%",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* drag handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.gray[200], alignSelf: "center", marginBottom: 14 }} />
            {/* header row */}
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 18 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: Colors.gray[900] }}>
                {t("customer.chatScreen.customOfferTitle")}
              </Text>
              <TouchableOpacity onPress={() => setOfferDetailVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.gray[500]} />
              </TouchableOpacity>
            </View>

            {offerDetailLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : !offerDetailData ? (
              <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 20 }}>
                <Text style={{ color: Colors.gray[500], textAlign: "center" }}>Could not load offer details.</Text>
              </View>
            ) : (() => {
              const d = offerDetailData;
              const req = d.request;
              const isExpired = d.status === "expired";
              const isWithdrawn = d.status === "withdrawn";
              const isPaid = d.status === "paid";
              const isPending = d.status === "pending";
              const isPaymentPending = d.status === "payment_pending";

              const formatDate = (iso: string | null | undefined) => {
                if (!iso) return t("customer.chatScreen.emDash");
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
                ? { label: t("customer.chatScreen.customOfferWithdrawn").replace(".", ""), bg: "#FEF3C7", text: "#92400E" }
                : isExpired
                ? { label: t("customer.chatScreen.customOfferExpired").replace(".", ""), bg: "#F3F4F6", text: "#6B7280" }
                : isPaid
                ? { label: t("customer.chatScreen.customOfferPaid"), bg: "#DCFCE7", text: "#166534" }
                : isPaymentPending
                ? { label: t("customer.chatScreen.customOfferPaymentPending"), bg: "#DBEAFE", text: "#1D4ED8" }
                : { label: t("customer.chatScreen.offerStatusPending"), bg: "#EFF6FF", text: "#1E40AF" };

              const locationLabel =
                req?.location_type === "at_home"
                  ? t("customer.chatScreen.locationAtHome")
                  : req?.location_type === "at_salon"
                    ? t("customer.chatScreen.locationAtSalon")
                    : req?.location_type ?? t("customer.chatScreen.emDash");
              const addressParts = [req?.address_line1, req?.address_line2, req?.address_city, req?.address_state, req?.address_postal_code].filter(Boolean);

              return (
                <View style={{ paddingHorizontal: 20 }}>
                  {/* Status badge */}
                  <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: statusBadge.bg, marginBottom: 16 }}>
                    <Text style={{ color: statusBadge.text, fontSize: 12, fontWeight: "700" }}>{statusBadge.label}</Text>
                  </View>

                  {/* Service name */}
                  {req?.service_name ? (
                    <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>{req.service_name}</Text>
                  ) : null}

                  {/* Price */}
                  <Text style={{ fontSize: 28, fontWeight: "800", color: Colors.primary, marginBottom: 4 }}>
                    {d.currency || ""} {typeof d.price === "number" ? d.price.toFixed(2) : t("customer.chatScreen.emDash")}
                    {typeof d.travel_fee === "number" && d.travel_fee > 0 ? (
                      <Text style={{ fontSize: 13, color: Colors.gray[500], fontWeight: "400" }}>
                        {" "}
                        {t("customer.chatScreen.travelFeeSuffix", {
                          currency: d.currency ?? "",
                          amount: d.travel_fee.toFixed(2),
                        })}
                      </Text>
                    ) : null}
                  </Text>

                  {/* Description */}
                  {req?.description ? (
                    <Text style={{ color: Colors.gray[600], fontSize: 14, marginBottom: 14, lineHeight: 20 }}>{req.description}</Text>
                  ) : null}

                  {/* Detail rows */}
                  <View style={{ gap: 10 }}>
                    {d.duration_minutes ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Ionicons name="time-outline" size={16} color={Colors.gray[500]} style={{ marginTop: 1 }} />
                        <Text style={{ color: Colors.gray[700], fontSize: 14 }}>
                          {t("customer.chatScreen.durationMinutesShort", { count: d.duration_minutes })}
                        </Text>
                      </View>
                    ) : null}
                    {req?.preferred_start_at ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Ionicons name="calendar-outline" size={16} color={Colors.gray[500]} style={{ marginTop: 1 }} />
                        <Text style={{ color: Colors.gray[700], fontSize: 14 }}>{formatDate(req.preferred_start_at)}</Text>
                      </View>
                    ) : null}
                    {d.expiration_at ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Ionicons name="hourglass-outline" size={16} color={isExpired ? "#B45309" : Colors.gray[500]} style={{ marginTop: 1 }} />
                        <Text style={{ color: isExpired ? "#B45309" : Colors.gray[700], fontSize: 14 }}>
                          {t("customer.chatScreen.offerExpiresInline", { datetime: formatDate(d.expiration_at) })}
                        </Text>
                      </View>
                    ) : null}
                    {req?.location_type ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Ionicons name="location-outline" size={16} color={Colors.gray[500]} style={{ marginTop: 1 }} />
                        <View>
                          <Text style={{ color: Colors.gray[700], fontSize: 14 }}>{locationLabel}</Text>
                          {addressParts.length > 0 ? (
                            <Text style={{ color: Colors.gray[500], fontSize: 12, marginTop: 2 }}>{addressParts.join(", ")}</Text>
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                    {d.notes ? (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Ionicons name="document-text-outline" size={16} color={Colors.gray[500]} style={{ marginTop: 1 }} />
                        <Text style={{ color: Colors.gray[700], fontSize: 14, flex: 1, lineHeight: 20 }}>{d.notes}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* CTA */}
                  {isPending && d.id ? (
                    <TouchableOpacity
                      onPress={() => {
                        setOfferDetailVisible(false);
                        setTimeout(() => openAcceptOfferOptions(d.id), 300);
                      }}
                      style={{
                        marginTop: 24,
                        borderRadius: 12,
                        backgroundColor: Colors.primary,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 14,
                      }}
                    >
                      <Text style={{ color: Colors.white, fontSize: 15, fontWeight: "700" }}>{t("customer.chatScreen.customOfferAcceptPay")}</Text>
                    </TouchableOpacity>
                  ) : isPaid && d.booking_id ? (
                    <TouchableOpacity
                      onPress={() => {
                        setOfferDetailVisible(false);
                        setTimeout(() => router.push({ pathname: "/(app)/booking-detail", params: { id: d.booking_id! } }), 300);
                      }}
                      style={{
                        marginTop: 24,
                        borderRadius: 12,
                        backgroundColor: "#166534",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 14,
                      }}
                    >
                      <Text style={{ color: Colors.white, fontSize: 15, fontWeight: "700" }}>{t("customer.chatScreen.customOfferPaidViewBooking")}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })()}
          </Pressable>
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
