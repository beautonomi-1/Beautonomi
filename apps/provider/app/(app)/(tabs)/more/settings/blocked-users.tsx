import { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { useUserBlocks } from "@/hooks/useUserBlocks";
import { useScreenTracking } from "@/hooks/useScreenTracking";

export default function BlockedUsersScreen() {
  useScreenTracking("Blocked users");
  const { t } = useTranslation();
  const router = useRouter();
  const { blockedUsers, loading, busyUserId, unblockUser } = useUserBlocks();

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

  return (
    <>
      <Stack.Screen
        options={{
          title: t("customer.mobile.screens.blockedUsers.title"),
          headerBackTitle: t("common.back"),
        }}
      />
      <View style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
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
          </View>
        ) : (
          <FlatList
            data={blockedUsers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => {
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
          onPress={() => router.push("/(app)/(tabs)/more/safety" as never)}
          style={{ padding: 16, alignItems: "center" }}
        >
          <Text style={{ color: Colors.primary, fontWeight: "500" }}>
            {t("customer.mobile.screens.blockedUsers.safetyHubLink")}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}
