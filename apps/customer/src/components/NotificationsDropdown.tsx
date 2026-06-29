import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  Pressable as RNPressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import {
  GestureHandlerRootView,
  ScrollView,
  TouchableOpacity,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import {
  registerNotificationsRealtimeCallback,
  useNotifications,
} from "@/providers/NotificationsContext";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import {
  SwipeableNotificationRow,
  useNotificationSwipeRegistry,
} from "@/components/SwipeableNotificationRow";
import {
  type Notification,
  formatNotificationTime,
  navigateFromNotification,
} from "@/lib/notifications";
import { haptic } from "@/lib/haptics";
import { useTranslation } from "@beautonomi/i18n";

const RECENT_LIMIT = 10;

interface NotificationsDropdownProps {
  visible: boolean;
  onClose: () => void;
}

export function NotificationsDropdown({ visible, onClose }: NotificationsDropdownProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { refetchUnreadCount, refetchChatUnreadCount, adjustUnreadCount, replaceUnreadCount, unreadCount } = useNotifications();
  const swipeRegistry = useNotificationSwipeRegistry();
  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await api.get<{
        notifications?: Notification[];
        data?: { notifications?: Notification[] };
      }>("/api/me/notifications?limit=10");
      if (res.error) {
        // Surface the failure (parity with the provider dropdown) instead of
        // silently rendering an empty "No notifications" state.
        setError(true);
        return;
      }
      const body = res.data as { notifications?: Notification[]; data?: { notifications?: Notification[] } } | undefined;
      const items = body?.notifications ?? body?.data?.notifications ?? [];
      const arr = Array.isArray(items) ? items : [];
      setList(arr.slice(0, RECENT_LIMIT));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (visible && user?.id) load();
  }, [visible, user?.id, load]);

  // Keep the open dropdown in sync with realtime notification changes (same
  // source the full list uses), so a notification arriving while it's open
  // appears without reopening.
  useEffect(() => {
    if (!visible || !user?.id) return;
    return registerNotificationsRealtimeCallback(() => {
      void load();
    });
  }, [visible, user?.id, load]);

  const markRead = async (id: string, rollbackIfUnread: boolean) => {
    try {
      await api.post(`/api/me/notifications/${id}/read`);
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      await refetchUnreadCount();
    } catch {
      if (rollbackIfUnread) adjustUnreadCount(1);
    }
  };

  const markAllRead = async () => {
    if (markingRead) return;
    setMarkingRead(true);
    replaceUnreadCount(0);
    try {
      const res = await api.post<{ total_unread?: number; data?: { total_unread?: number } }>(
        "/api/me/notifications/mark-all-read",
      );
      if (res.error) {
        await Promise.all([refetchUnreadCount(), refetchChatUnreadCount()]);
        Alert.alert(
          t("common.error"),
          res.error.message || t("customer.mobile.components.notificationsDropdown.markAllReadError"),
        );
        return;
      }
      const body = res.data as { total_unread?: number; data?: { total_unread?: number } } | undefined;
      const serverNotifUnread =
        typeof body?.total_unread === "number"
          ? body.total_unread
          : typeof body?.data?.total_unread === "number"
            ? body.data.total_unread
            : 0;
      replaceUnreadCount(serverNotifUnread);
      setList((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await Promise.all([refetchUnreadCount(), refetchChatUnreadCount()]);
    } catch {
      await Promise.all([refetchUnreadCount(), refetchChatUnreadCount()]);
      Alert.alert(
        t("common.error"),
        t("customer.mobile.components.notificationsDropdown.markAllReadError"),
      );
    } finally {
      setMarkingRead(false);
    }
  };

  const deleteNotification = async (n: Notification) => {
    const wasUnread = !n.is_read;
    const snapshot = list;
    setList((prev) => prev.filter((item) => item.id !== n.id));
    if (wasUnread) adjustUnreadCount(-1);
    const res = await api.delete(`/api/me/notifications/${encodeURIComponent(n.id)}`);
    if (res.error) {
      setList(snapshot);
      if (wasUnread) adjustUnreadCount(1);
      Alert.alert(t("common.error"), res.error.message || t("customer.mobile.components.notificationsDropdown.deleteError"));
      return;
    }
    await refetchUnreadCount();
  };

  const confirmDelete = (n: Notification) => {
    Alert.alert(
      t("customer.mobile.components.notificationsDropdown.deleteConfirmTitle"),
      t("customer.mobile.components.notificationsDropdown.deleteConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => void deleteNotification(n),
        },
      ],
    );
  };

  const handleItemPress = (n: Notification) => {
    haptic.selection();
    if (!n.is_read) {
      adjustUnreadCount(-1);
      void markRead(n.id, true);
    }
    onClose();
    navigateFromNotification(n);
  };

  const handleViewAll = () => {
    haptic.selection();
    onClose();
    router.push("/(app)/notifications");
  };

  const hasUnread = unreadCount > 0 || list.some((n) => !n.is_read);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <RNPressable style={styles.backdrop} onPress={onClose}>
        {/* Plain View stops touch propagation to the backdrop without consuming
            child taps — fixes Android nested-Pressable interception so the
            "Mark all read" and "View all" buttons receive taps correctly. */}
        <View
          style={[
            styles.card,
            {
              paddingTop: Math.max(12, insets.top),
              paddingBottom: Math.max(16, insets.bottom),
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleBlock}>
              <Text style={styles.title}>Notifications</Text>
              <Text style={styles.swipeHint}>Swipe left on a row to delete</Text>
            </View>
            {hasUnread && (
              <TouchableOpacity
                onPress={() => {
                  haptic.selection();
                  void markAllRead();
                }}
                disabled={markingRead}
                hitSlop={12}
                accessibilityLabel="Mark all as read"
                style={{ opacity: markingRead ? 0.5 : 1 }}
              >
                {markingRead ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.markAllRead}>Mark all read</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* List */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : error && list.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={32} color={Colors.gray[300]} />
              <Text style={styles.emptyText}>Couldn’t load notifications</Text>
              <TouchableOpacity onPress={() => void load()} hitSlop={12} style={{ marginTop: 8 }}>
                <Text style={styles.markAllRead}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : list.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={32} color={Colors.gray[300]} />
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          ) : (
            <View style={styles.scrollRoot}>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled
              >
                {list.map((n) => (
                  <SwipeableNotificationRow
                    key={n.id}
                    itemId={n.id}
                    onDelete={() => confirmDelete(n)}
                    swipeRegistry={swipeRegistry}
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleItemPress(n)}
                      style={[styles.row, !n.is_read && styles.rowUnread]}
                      accessibilityHint="Swipe left to delete. Opens related screen."
                    >
                      {!n.is_read && <View style={styles.unreadDot} />}
                      <View style={styles.rowContent}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{n.title}</Text>
                        <Text style={styles.rowMessage} numberOfLines={2}>{n.message}</Text>
                        <Text style={styles.rowTime}>{formatNotificationTime(n.created_at)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
                    </TouchableOpacity>
                  </SwipeableNotificationRow>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Footer: View all */}
          <TouchableOpacity
            onPress={handleViewAll}
            style={styles.viewAllButton}
            activeOpacity={0.8}
            accessibilityLabel="View all notifications"
          >
            <Text style={styles.viewAllText}>View all notifications</Text>
            <Ionicons name="open-outline" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </RNPressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 48,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    maxHeight: "75%",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.gray[900],
  },
  swipeHint: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.gray[500],
  },
  scrollRoot: {
    maxHeight: 320,
  },
  markAllRead: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.primary,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.gray[500],
  },
  scroll: {
    maxHeight: 320,
  },
  scrollContent: {
    paddingVertical: 8,
    paddingBottom: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[100],
  },
  rowUnread: {
    backgroundColor: "rgba(255, 0, 119, 0.06)",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginRight: 10,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.gray[900],
  },
  rowMessage: {
    fontSize: 13,
    color: Colors.gray[600],
    marginTop: 2,
  },
  rowTime: {
    fontSize: 12,
    color: Colors.gray[400],
    marginTop: 4,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  viewAllText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.primary,
  },
});
