import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import type { WaitingRoomListEntry } from "@/features/calendar/types/waiting-room";

interface Props {
  visible: boolean;
  entries: WaitingRoomListEntry[] | null;
  loading: boolean;
  onClose: () => void;
}

export function WalkInQueueSheet({ visible, entries, loading, onClose }: Props) {
  const router = useRouter();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Walk-in Queue" snapHeight="auto" showHandle>
      <View style={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} />
        ) : !entries?.length ? (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <Ionicons name="people-outline" size={40} color={Colors.gray[300]} />
            <Text style={{ marginTop: 12, fontSize: 15, color: Colors.gray[500], textAlign: "center" }}>
              No clients waiting right now.
            </Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {entries.map((entry, i) => (
              <View
                key={entry.id ?? i}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.gray[100],
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: Colors.gray[200],
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.gray[600] }}>
                    {i + 1}
                  </Text>
                </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>
                  {String(entry.customer_name ?? "Walk-in client")}
                </Text>
                {entry.service_name ? (
                  <Text style={{ fontSize: 13, color: Colors.gray[500] }}>{String(entry.service_name)}</Text>
                ) : null}
              </View>
              </View>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity
          style={{
            marginTop: 20,
            borderRadius: 12,
            paddingVertical: 12,
            backgroundColor: Colors.primary,
            alignItems: "center",
          }}
          onPress={() => {
            router.push("/(app)/(tabs)/more/waiting-room" as never);
            onClose();
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.white }}>Open Waiting Room</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
