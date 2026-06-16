import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { useProvider } from "@/providers/ProviderContext";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";
import { playAlertCue } from "@/lib/alert-sound";
import { getActiveMessagingConversationId } from "@/lib/active-messaging-context";
import {
  conversationAlertMessage,
  conversationAlertTitle,
  shouldAlertForConversationUpdate,
  type MessageConversationRow,
} from "@/lib/message-alert-handler";
import {
  getAlertSoundPrefs,
  refreshAlertSoundPrefs,
  subscribeAlertSoundPrefs,
} from "@/lib/notification-alert-prefs";
import { useInAppBanner } from "@/providers/InAppBannerProvider";

export function MessageAlertListener() {
  const router = useRouter();
  const { provider } = useProvider();
  const { show } = useInAppBanner();
  const unreadByConversation = useRef<Map<string, number>>(new Map());
  const appState = useRef(AppState.currentState);
  const cueRef = useRef<{ stop: () => void } | null>(null);

  const showMessageBanner = useCallback(
    (row: MessageConversationRow) => {
      if (getActiveMessagingConversationId() === row.id) return;

      if (getAlertSoundPrefs().message_alert_sound !== false) {
        cueRef.current?.stop();
        void playAlertCue().then((ctrl) => {
          cueRef.current = ctrl;
        });
      }

      show({
        icon: "chatbubble-ellipses-outline",
        title: conversationAlertTitle(row),
        message: conversationAlertMessage(row),
        tone: "info",
        onPress: () => {
          cueRef.current?.stop();
          router.push({
            pathname: "/(app)/(tabs)/chats/[id]",
            params: { id: row.id },
          });
        },
      });
    },
    [router, show],
  );

  const onConversationUpdate = useCallback(
    (row: MessageConversationRow) => {
      if (appState.current !== "active") return;
      const prev = unreadByConversation.current.get(row.id) ?? 0;
      unreadByConversation.current.set(row.id, Number(row.unread_count_provider ?? 0));
      if (!shouldAlertForConversationUpdate(row, prev)) return;
      showMessageBanner(row);
    },
    [showMessageBanner],
  );

  useEffect(() => {
    void refreshAlertSoundPrefs();
    return subscribeAlertSoundPrefs(() => {
      void refreshAlertSoundPrefs();
    });
  }, []);

  useEffect(() => {
    if (!provider?.id) return;

    const channel = supabase
      .channel(nextRealtimeTopic(`message-alerts:${provider.id}`))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `provider_id=eq.${provider.id}`,
        },
        (payload) => {
          onConversationUpdate(payload.new as MessageConversationRow);
        },
      )
      .subscribe();

    const appStateSub = AppState.addEventListener("change", (next) => {
      appState.current = next;
      if (next === "active") {
        void refreshAlertSoundPrefs();
      }
    });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
      appStateSub.remove();
      cueRef.current?.stop();
    };
  }, [provider?.id, onConversationUpdate]);

  return null;
}
