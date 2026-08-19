import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { useUserBlocks, type BlockedUserRow } from "@/hooks/useUserBlocks";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { ScreenFrame } from "@/components/ScreenFrame";
import { TrustScreenShell } from "@/components/safety/TrustScreenShell";
import { navigateFromSafetyHub, useFromSafetyHub, useSafetyStackBack } from "@/lib/customer-safety-navigation";

export default function BlockedUsersScreen() {
  useScreenTracking("Blocked users");
  const { t } = useTranslation();
  const router = useRouter();
  const fromSafety = useFromSafetyHub();
  const safetyBack = useSafetyStackBack();
  const { blockedUsers, loading, busyUserId, unblockUser } = useUserBlocks();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 280);

  const bu = useCallback(
    (key: string, opts?: Record<string, string | number>) =>
      t(`customer.mobile.screens.blockedUsers.${key}`, {
        ...(opts ?? {}),
        defaultValue: t(`provider.mobile.screens.blockedUsers.${key}`, opts ?? {}),
      }) as string,
    [t],
  );

  const title = t("customer.mobile.screens.blockedUsers.title");
  const breadcrumbSegment = bu("breadcrumb");

  const filteredUsers = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return blockedUsers;
    return blockedUsers.filter((u) => {
      const name = (u.full_name ?? "").toLowerCase();
      const reason = (u.reason ?? "").toLowerCase();
      return name.includes(q) || reason.includes(q);
    });
  }, [blockedUsers, debouncedSearch]);

  const handleUnblock = useCallback(
    (userId: string, name: string | null) => {
      Alert.alert(
        t("customer.mobile.screens.blockedUsers.unblockTitle"),
        t("customer.mobile.screens.blockedUsers.unblockBody", {
          name: name || t("customer.blockUser.defaultName"),
        }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("customer.mobile.screens.blockedUsers.unblockAction"),
            onPress: () => void unblockUser(userId),
          },
        ],
      );
    },
    [t, unblockUser],
  );

  const openReportUser = useCallback(() => {
    const pathname = "/(app)/safety/report-user";
    if (fromSafety) {
      navigateFromSafetyHub(router, pathname);
    } else {
      router.push(pathname as never);
    }
  }, [fromSafety, router]);

  return (
    <ScreenFrame scrollable={false}>
      <TrustScreenShell title={title} breadcrumbSegment={breadcrumbSegment} />
      <View style={{ flex: 1, backgroundColor: Colors.gray[50], marginHorizontal: -16 }}>
        {blockedUsers.length > 8 ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={bu("searchPlaceholder")}
              placeholderTextColor={Colors.gray[400]}
              accessibilityLabel={bu("searchPlaceholder")}
              style={{
                backgroundColor: Colors.white,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                fontSize: 15,
                color: Colors.gray[900],
              }}
            />
          </View>
        ) : null}

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : blockedUsers.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Ionicons name="people-outline" size={48} color={Colors.gray[300]} />
            <Text style={{ marginTop: 12, fontSize: 16, color: Colors.gray[500], textAlign: "center" }}>
              {t("customer.mobile.screens.blockedUsers.empty")}
            </Text>
            <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[400], textAlign: "center" }}>
              {bu("emptyReportHint")}
            </Text>
            <TouchableOpacity
              onPress={openReportUser}
              style={{
                marginTop: 20,
                backgroundColor: Colors.primary,
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 12,
              }}
              accessibilityRole="button"
            >
              <Text style={{ color: Colors.white, fontWeight: "600" }}>{bu("emptyReportCta")}</Text>
            </TouchableOpacity>
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Text style={{ fontSize: 15, color: Colors.gray[500], textAlign: "center" }}>
              {t("common.noResults", { defaultValue: "No matches for your search." })}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item: BlockedUserRow) => item.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }: { item: BlockedUserRow }) => {
              const displayName = item.full_name || t("customer.blockUser.defaultName");
              const initial = displayName.charAt(0).toUpperCase();
              const busy = busyUserId === item.user_id;
              return (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: Colors.white,
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: Colors.gray[100],
                  }}
                >
                  {item.avatar_url ? (
                    <Image
                      source={{ uri: item.avatar_url }}
                      style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: Colors.gray[200],
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <Text style={{ fontWeight: "600", color: Colors.gray[600] }}>{initial}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{displayName}</Text>
                    {item.reason ? (
                      <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>
                        {t(`customer.blockUser.reason.${item.reason}`, { defaultValue: item.reason })}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleUnblock(item.user_id, item.full_name)}
                    disabled={busy}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: Colors.gray[200],
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("customer.mobile.screens.blockedUsers.unblockAction")}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.primary }}>
                        {t("customer.mobile.screens.blockedUsers.unblockAction")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
        <TouchableOpacity
          onPress={() => (fromSafety ? safetyBack() : router.push("/(app)/safety" as never))}
          style={{ padding: 16, alignItems: "center" }}
          accessibilityRole="link"
        >
          <Text style={{ color: Colors.primary, fontWeight: "500" }}>
            {t("customer.mobile.screens.blockedUsers.safetyHubLink")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenFrame>
  );
}
