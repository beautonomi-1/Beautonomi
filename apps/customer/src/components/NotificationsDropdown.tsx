import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useNotifications } from "@/providers/NotificationsContext";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import {
  type Notification,
  formatNotificationTime,
  navigateFromNotification,
} from "@/lib/notifications";
import { haptic } from "@/lib/haptics";

const RECENT_LIMIT = 10;

interface NotificationsDropdownProps {
  visible: boolean;
  onClose: () => void;
}

export function NotificationsDropdown({ visible, onClose }: NotificationsDropdownProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { refetchUnreadCount } = useNotifications();
  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await api.get<{
        notifications?: Notification[];
        data?: { notifications?: Notification[] };
      }>("/api/me/notifications");
      const body = res.data as { notifications?: Notification[]; data?: { notifications?: Notification[] } } | undefined;
      const items = body?.notifications ?? body?.data?.notifications ?? [];
      const arr = Array.isArray(items) ? items : [];
      setList(arr.slice(0, RECENT_LIMIT));
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (visible && user?.id) load();
  }, [visible, user?.id, load]);

  const markRead = async (id: string) => {
    try {
      await api.post(`/api/me/notifications/${id}/read`);
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      await refetchUnreadCount();
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    try {
      await api.post("/api/me/notifications/mark-all-read");
      setList((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await refetchUnreadCount();
    } catch {
      // ignore
    }
  };

  const handleItemPress = (n: Notification) => {
    haptic.selection();
    if (!n.is_read) markRead(n.id);
    onClose();
    navigateFromNotification(n);
  };

  const handleViewAll = () => {
    haptic.selection();
    onClose();
    router.push("/(app)/notifications");
  };

  const hasUnread = list.some((n) => !n.is_read);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.card,
            {
              paddingTop: Math.max(12, insets.top),
              paddingBottom: Math.max(16, insets.bottom),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Notifications</Text>
            {hasUnread && (
              <TouchableOpacity
                onPress={() => {
                  haptic.selection();
                  markAllRead();
                }}
                hitSlop={12}
                accessibilityLabel="Mark all as read"
              >
                <Text style={styles.markAllRead}>Mark all read</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* List */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : list.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={32} color={Colors.gray[300]} />
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {list.map((n) => (
                <TouchableOpacity
                  key={n.id}
                  activeOpacity={0.7}
                  onPress={() => handleItemPress(n)}
                  style={[styles.row, !n.is_read && styles.rowUnread]}
                >
                  {!n.is_read && <View style={styles.unreadDot} />}
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{n.title}</Text>
                    <Text style={styles.rowMessage} numberOfLines={2}>{n.message}</Text>
                    <Text style={styles.rowTime}>{formatNotificationTime(n.created_at)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
                </TouchableOpacity>
              ))}
            </ScrollView>
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
        </Pressable>
      </Pressable>
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.gray[900],
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
