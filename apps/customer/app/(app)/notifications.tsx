import { useEffect, useState, useCallback, useRef, useMemo, type ComponentProps } from "react";
import { useTranslation } from "@beautonomi/i18n";
import {
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  Platform,
  StyleSheet,
  Alert,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Stack, router } from "expo-router";
import {
  GestureHandlerRootView,
  Pressable,
  ScrollView,
  TouchableOpacity,
} from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { registerNotificationsRealtimeCallback, useNotifications } from "@/providers/NotificationsContext";
import { api } from "@/lib/api-client";
import { Colors, Shadows } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM, RADIUS_CARD } from "@/constants/layout";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import {
  SwipeableNotificationRow,
  useNotificationSwipeRegistry,
} from "@/components/SwipeableNotificationRow";
import {
  type Notification,
  formatNotificationTime,
  navigateFromNotification,
  iconNameForNotificationType,
} from "@/lib/notifications";

const PAGE_SIZE = 30;

type IonName = ComponentProps<typeof Ionicons>["name"];

function extractNotifications(payload: unknown): Notification[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const inner = p.notifications ?? (p.data as Record<string, unknown> | undefined)?.notifications;
  return Array.isArray(inner) ? (inner as Notification[]) : [];
}

function extractTotalUnread(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as Record<string, unknown>;
  const v = p.total_unread ?? (p.data as Record<string, unknown> | undefined)?.total_unread;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export default function NotificationsScreen() {
  useScreenTracking("Notifications");
  const { t } = useTranslation();
  const nc = useCallback((key: string) => t(`customer.mobile.screens.notificationsCenter.${key}`), [t]);
  const { user } = useAuth();
  const { unreadCount, refetchUnreadCount, refetchChatUnreadCount, adjustUnreadCount, replaceUnreadCount } = useNotifications();
  const swipeRegistry = useNotificationSwipeRegistry();
  const insets = useSafeAreaInsets();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web")
    ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
    : {};

  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loadError, setLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalUnreadHint, setTotalUnreadHint] = useState<number | undefined>(undefined);

  const listLengthRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  useEffect(() => {
    listLengthRef.current = list.length;
  }, [list.length]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const load = useCallback(
    async (opts?: { refresh?: boolean; append?: boolean }) => {
      if (!user?.id) return;
      const append = opts?.append === true;
      const refresh = opts?.refresh === true;

      if (append) {
        if (!hasMoreRef.current || loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoadError(false);
        if (refresh) setRefreshing(true);
        else setLoading(true);
      }

      try {
        const unreadOnly = filter === "unread";
        const offset = append ? listLengthRef.current : 0;
        const qs = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
          ...(unreadOnly ? { unread_only: "true" } : {}),
        });
        const res = await api.get<unknown>(`/api/me/notifications?${qs.toString()}`);
        if (res.error) {
          setLoadError(true);
          return;
        }
        const payload = res.data as unknown;
        const items = extractNotifications(payload);
        const unreadTotal = extractTotalUnread(payload);
        if (unreadTotal !== undefined) setTotalUnreadHint(unreadTotal);

        if (append) {
          setList((prev) => {
            const seen = new Set(prev.map((n) => n.id));
            const merged = [...prev];
            for (const n of items) {
              if (!seen.has(n.id)) {
                seen.add(n.id);
                merged.push(n);
              }
            }
            return merged;
          });
        } else {
          setList(items);
        }
        const more = items.length >= PAGE_SIZE;
        setHasMore(more);
        hasMoreRef.current = more;
        if (refresh) await refetchUnreadCount();
      } catch {
        if (!append) setLoadError(true);
      } finally {
        loadingMoreRef.current = false;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [user?.id, filter, refetchUnreadCount],
  );

  useEffect(() => {
    if (user?.id) {
      hasMoreRef.current = true;
      setHasMore(true);
      void load();
    } else {
      setLoading(false);
    }
  }, [user?.id, filter, load]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!user?.id) return;
    return registerNotificationsRealtimeCallback(() => {
      void loadRef.current({ refresh: true });
    });
  }, [user?.id]);

  const markRead = useCallback(
    async (id: string, wasUnread: boolean) => {
      if (wasUnread) adjustUnreadCount(-1);
      try {
        const res = await api.post(`/api/me/notifications/${id}/read`);
        if (res.error) {
          if (wasUnread) adjustUnreadCount(1);
          Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), res.error.message || nc("markReadError"));
          return;
        }
        setList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
        await refetchUnreadCount();
      } catch (e) {
        if (wasUnread) adjustUnreadCount(1);
        Alert.alert(
          t("customer.mobile.screens.authLogin.errorTitle"),
          e instanceof Error ? e.message : nc("markReadError"),
        );
      }
    },
    [refetchUnreadCount, adjustUnreadCount, t, nc],
  );

  const markAllRead = useCallback(async () => {
    replaceUnreadCount(0);
    setTotalUnreadHint(0);
    try {
      const res = await api.post<{ total_unread?: number; data?: { total_unread?: number } }>(
        "/api/me/notifications/mark-all-read",
      );
      if (res.error) {
        await Promise.all([refetchUnreadCount(), refetchChatUnreadCount()]);
        Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), res.error.message || nc("markAllReadError"));
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
      setTotalUnreadHint(serverNotifUnread);
      await Promise.all([refetchUnreadCount(), refetchChatUnreadCount()]);
    } catch (e) {
      await Promise.all([refetchUnreadCount(), refetchChatUnreadCount()]);
      Alert.alert(
        t("customer.mobile.screens.authLogin.errorTitle"),
        e instanceof Error ? e.message : nc("markAllReadError"),
      );
    }
  }, [refetchUnreadCount, refetchChatUnreadCount, replaceUnreadCount, t, nc]);

  const deleteNotification = useCallback(async (notificationId: string, wasUnread: boolean) => {
    if (wasUnread) adjustUnreadCount(-1);
    let snapshot: Notification[] = [];
    setList((prev) => {
      snapshot = prev;
      return prev.filter((n) => n.id !== notificationId);
    });
    const res = await api.delete(`/api/me/notifications/${encodeURIComponent(notificationId)}`);
    if (res.error) {
      setList(snapshot);
      if (wasUnread) adjustUnreadCount(1);
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), res.error.message || nc("deleteError"));
      return;
    }
    await refetchUnreadCount();
  }, [refetchUnreadCount, adjustUnreadCount, t, nc]);

  const confirmDelete = useCallback(
    (n: Notification) => {
      Alert.alert(nc("deleteConfirmTitle"), nc("deleteConfirmBody"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => void deleteNotification(n.id, !n.is_read),
        },
      ]);
    },
    [deleteNotification, nc, t],
  );

  const onPress = useCallback(
    (n: Notification) => {
      if (!n.is_read) void markRead(n.id, true);
      navigateFromNotification(n);
    },
    [markRead],
  );

  const notifKeyExtractor = useCallback((n: Notification) => n.id, []);

  // Drive "mark all read" visibility from the authoritative server unread count
  // (context badge + server total hint), not just the currently loaded page, so
  // the action still shows when unread items exist beyond page 1.
  const hasUnread = useMemo(
    () =>
      unreadCount > 0 ||
      (typeof totalUnreadHint === "number" && totalUnreadHint > 0) ||
      list.some((n) => !n.is_read),
    [unreadCount, totalUnreadHint, list],
  );

  const onEndReached = useCallback(() => {
    if (loading || loadingMore || !hasMore || loadError) return;
    void load({ append: true });
  }, [loading, loadingMore, hasMore, loadError, load]);

  const renderNotificationItem = useCallback(
    ({ item }: { item: Notification }) => {
      const icon = iconNameForNotificationType(item.type) as IonName;
      const unread = !item.is_read;
      return (
        <SwipeableNotificationRow
          itemId={item.id}
          onDelete={() => confirmDelete(item)}
          deleteLabel={nc("deleteSwipeLabel")}
          deleteA11y={nc("deleteSwipeA11y")}
          swipeRegistry={swipeRegistry}
        >
          <Pressable
            onPress={() => onPress(item)}
            style={({ pressed }) => [
              styles.card,
              unread && styles.cardUnread,
              pressed && styles.cardPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.message}`}
            accessibilityHint={unread ? nc("itemUnreadHint") : nc("itemReadHint")}
          >
            <View style={[styles.iconWrap, unread && styles.iconWrapUnread]}>
              <Ionicons name={icon} size={22} color={unread ? Colors.primary : Colors.gray[500]} />
            </View>
            <View style={styles.cardBody}>
              <View style={styles.titleRow}>
                {unread ? <View style={styles.dot} /> : null}
                <Text style={[styles.cardTitle, unread && styles.cardTitleUnread]} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
              {item.message ? (
                <Text style={styles.cardMessage} numberOfLines={3}>
                  {item.message}
                </Text>
              ) : null}
              <Text style={styles.cardTime}>{formatNotificationTime(item.created_at)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.gray[300]} style={styles.chevron} />
          </Pressable>
        </SwipeableNotificationRow>
      );
    },
    [onPress, confirmDelete, nc, swipeRegistry],
  );

  const bottomPad = STACK_CONTENT_PADDING_BOTTOM + Math.max(insets.bottom, 8);

  if (!user) {
    return (
      <View style={styles.centered}>
        <Ionicons name="notifications-off-outline" size={48} color={Colors.gray[300]} />
        <Text style={styles.muted}>{nc("logInPrompt")}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: nc("screenTitle"),
          headerRight: () => (
            <View style={styles.headerRight}>
              <TouchableOpacity
                onPress={() => router.push("/(app)/account-settings/notifications")}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={nc("settingsA11y")}
              >
                <Ionicons name="settings-outline" size={22} color={Colors.primary} />
              </TouchableOpacity>
              {hasUnread ? (
                <TouchableOpacity onPress={markAllRead} accessibilityRole="button" accessibilityLabel={nc("markAllReadA11y")}>
                  <Text style={styles.markAllText}>{nc("readAll")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ),
        }}
      />
      <View style={styles.screen}>
        <View style={[styles.filterWrap, { paddingHorizontal: contentPadding }]}>
          <View style={styles.filterInner}>
            <TouchableOpacity
              onPress={() => setFilter("all")}
              style={[styles.filterTab, filter === "all" && styles.filterTabActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === "all" }}
            >
              <Text style={[styles.filterTabText, filter === "all" && styles.filterTabTextActive]}>{nc("filterAll")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFilter("unread")}
              style={[styles.filterTab, filter === "unread" && styles.filterTabActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === "unread" }}
            >
              <Text style={[styles.filterTabText, filter === "unread" && styles.filterTabTextActive]}>{nc("filterUnread")}</Text>
              {typeof totalUnreadHint === "number" && totalUnreadHint > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{totalUnreadHint > 99 ? "99+" : totalUnreadHint}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/(app)/account-settings/notifications")}
            style={styles.prefsLink}
            accessibilityRole="button"
            accessibilityLabel={nc("prefsA11y")}
          >
            <Ionicons name="mail-outline" size={16} color={Colors.primary} />
            <Text style={styles.prefsLinkText}>{nc("prefsLink")}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray[400]} />
          </TouchableOpacity>
          <Text style={styles.gestureHint}>{nc("swipeHint")}</Text>
        </View>

        {loading && list.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loaderLabel}>{nc("loadingLabel")}</Text>
          </View>
        ) : (
          <GestureHandlerRootView style={styles.listRoot}>
            <FlashList
              data={list}
              extraData={filter}
              keyExtractor={notifKeyExtractor}
              renderItem={renderNotificationItem}
              renderScrollComponent={ScrollView}
              nestedScrollEnabled
              contentContainerStyle={{
                paddingHorizontal: contentPadding,
                paddingTop: 12,
                paddingBottom: bottomPad,
                ...constraint,
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => void load({ refresh: true })}
                  tintColor={Colors.primary}
                  colors={[Colors.primary]}
                />
              }
              onEndReached={onEndReached}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.footerMore}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Ionicons name="notifications-off-outline" size={56} color={Colors.gray[200]} />
                  <Text style={styles.emptyTitle}>
                    {loadError ? nc("emptyErrorTitle") : filter === "unread" ? nc("emptyCaughtUp") : nc("emptyNone")}
                  </Text>
                  <Text style={styles.emptySub}>
                    {loadError
                      ? nc("emptyErrorSub")
                      : filter === "unread"
                        ? nc("emptyUnreadSub")
                        : nc("emptyAllSub")}
                  </Text>
                  {loadError ? (
                    <TouchableOpacity onPress={() => void load()} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel={nc("retryA11y")}>
                      <Text style={styles.retryBtnText}>{nc("retry")}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              }
            />
          </GestureHandlerRootView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  listRoot: {
    flex: 1,
  },
  centered: {
    flex: 1,
    backgroundColor: Colors.gray[50],
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  muted: {
    marginTop: 12,
    color: Colors.gray[600],
    fontSize: 16,
    textAlign: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginRight: Platform.OS === "ios" ? 4 : 8,
  },
  markAllText: {
    color: Colors.primary,
    fontWeight: "600",
    fontSize: 15,
  },
  filterWrap: {
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: Colors.gray[50],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  filterInner: {
    flexDirection: "row",
    backgroundColor: Colors.gray[100],
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  filterTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: Colors.white,
    ...Shadows.cardSubtle,
  },
  filterTabText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.gray[600],
  },
  filterTabTextActive: {
    color: Colors.gray[900],
  },
  badge: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: "700",
  },
  prefsLink: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 6,
  },
  prefsLinkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: Colors.primary,
  },
  gestureHint: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.gray[500],
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 48,
  },
  loaderLabel: {
    marginTop: 12,
    fontSize: 15,
    color: Colors.gray[500],
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.white,
    borderRadius: RADIUS_CARD,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  cardUnread: {
    borderColor: "rgba(255, 0, 119, 0.2)",
    backgroundColor: Colors.white,
  },
  cardPressed: {
    opacity: 0.92,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.gray[100],
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconWrapUnread: {
    backgroundColor: Colors.primaryLight,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 6,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: Colors.gray[800],
    lineHeight: 22,
  },
  cardTitleUnread: {
    color: Colors.gray[900],
  },
  cardMessage: {
    marginTop: 4,
    fontSize: 14,
    color: Colors.gray[600],
    lineHeight: 20,
  },
  cardTime: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.gray[400],
    fontWeight: "500",
  },
  chevron: {
    marginLeft: 8,
    marginTop: 4,
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "700",
    color: Colors.gray[800],
    textAlign: "center",
  },
  emptySub: {
    marginTop: 8,
    fontSize: 15,
    color: Colors.gray[500],
    textAlign: "center",
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: 20,
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryBtnText: {
    color: Colors.white,
    fontWeight: "600",
    fontSize: 16,
  },
  footerMore: {
    paddingVertical: 16,
    alignItems: "center",
  },
});
