import { useCallback, useMemo, useState } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";

export type BlockedUserRow = {
  id: string;
  user_id: string;
  reason: string | null;
  blocked_at: string;
  full_name: string | null;
  avatar_url: string | null;
};

type BlockOptions = {
  userId?: string;
  providerId?: string;
  reason?: "harassment" | "spam" | "other";
  onBlocked?: () => void;
};

export function useUserBlocks() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const blockedUserIds = useMemo(
    () => new Set(blockedUsers.map((b) => b.user_id)),
    [blockedUsers],
  );

  const refresh = useCallback(async () => {
    if (!user) {
      setBlockedUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<BlockedUserRow[] | { data?: BlockedUserRow[] }>("/api/me/blocks");
      const rows = Array.isArray(res.data)
        ? res.data
        : ((res.data as { data?: BlockedUserRow[] })?.data ?? []);
      setBlockedUsers(rows);
    } catch {
      setBlockedUsers([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const isBlocked = useCallback(
    (userId: string | null | undefined) => Boolean(userId && blockedUserIds.has(userId)),
    [blockedUserIds],
  );

  const blockUser = useCallback(
    async (options: BlockOptions) => {
      if (!user) return false;
      const body: Record<string, string> = {};
      if (options.userId) body.user_id = options.userId;
      if (options.providerId) body.provider_id = options.providerId;
      if (options.reason) body.reason = options.reason;
      if (!body.user_id && !body.provider_id) return false;

      setBusyUserId(options.userId ?? options.providerId ?? "provider");
      try {
        const res = await api.post<{ user_id?: string }>("/api/me/blocks", body);
        if (res.error) {
          Alert.alert(
            t("customer.mobile.screens.authLogin.errorTitle"),
            res.error.message || t("customer.blockUser.errorBody"),
          );
          return false;
        }
        await refresh();
        options.onBlocked?.();
        return true;
      } catch {
        Alert.alert(
          t("customer.mobile.screens.authLogin.errorTitle"),
          t("customer.blockUser.errorBody"),
        );
        return false;
      } finally {
        setBusyUserId(null);
      }
    },
    [user, refresh, t],
  );

  const unblockUser = useCallback(
    async (userId: string) => {
      if (!user) return false;
      setBusyUserId(userId);
      try {
        const res = await api.delete(`/api/me/blocks/${encodeURIComponent(userId)}`);
        if (res.error) {
          Alert.alert(
            t("customer.mobile.screens.authLogin.errorTitle"),
            res.error.message || t("customer.blockUser.unblockErrorBody"),
          );
          return false;
        }
        setBlockedUsers((prev) => prev.filter((b) => b.user_id !== userId));
        return true;
      } catch {
        Alert.alert(
          t("customer.mobile.screens.authLogin.errorTitle"),
          t("customer.blockUser.unblockErrorBody"),
        );
        return false;
      } finally {
        setBusyUserId(null);
      }
    },
    [user, t],
  );

  const confirmBlockUser = useCallback(
    (options: BlockOptions & { displayName?: string }) => {
      Alert.alert(
        t("customer.blockUser.confirmTitle"),
        t("customer.blockUser.confirmBody", {
          name: options.displayName || t("customer.blockUser.defaultName"),
        }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("customer.blockUser.confirmAction"),
            style: "destructive",
            onPress: () => void blockUser(options),
          },
        ],
      );
    },
    [blockUser, t],
  );

  return {
    blockedUsers,
    blockedUserIds,
    loading,
    busyUserId,
    refresh,
    isBlocked,
    blockUser,
    unblockUser,
    confirmBlockUser,
  };
}
