import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useWalkInQueue } from "@/features/calendar/hooks/useWalkInQueue";

export function WalkInPanel({ waitingCount }: { waitingCount: number }) {
  const router = useRouter();
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const { entries, loading } = useWalkInQueue(focused);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: Colors.gray[100],
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: "700", color: Colors.gray[900] }}>Walk-in Queue</Text>
        <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
          {waitingCount === 0 ? "No clients waiting" : `${waitingCount} in queue`}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : !entries?.length ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Ionicons name="people-outline" size={48} color={Colors.gray[300]} />
          <Text style={{ marginTop: 16, fontSize: 17, fontWeight: "600", color: Colors.gray[400], textAlign: "center" }}>
            No clients waiting
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[400], textAlign: "center" }}>
            Walk-in clients will appear here when they check in.
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
          {entries.map((entry, i) => (
            <View
              key={String(entry.id ?? i)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: Colors.gray[100],
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: Colors.primaryLight,
                  borderWidth: 1,
                  borderColor: Colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.primary }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>
                  {String(entry.customer_name ?? "Walk-in client")}
                </Text>
                {entry.service_name ? (
                  <Text style={{ fontSize: 13, color: Colors.gray[500] }}>
                    {String(entry.service_name)}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 }}>
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/waiting-room" as never)}
          style={{
            borderRadius: 12,
            backgroundColor: Colors.primary,
            paddingVertical: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
          }}
          accessibilityRole="button"
        >
          <Ionicons name="people-outline" size={18} color={Colors.white} />
          <Text style={{ marginLeft: 8, fontSize: 16, fontWeight: "700", color: Colors.white }}>
            Manage Waiting Room
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
