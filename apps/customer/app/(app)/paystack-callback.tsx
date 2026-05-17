import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";

export default function PaystackCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/(app)/(tabs)/bookings");
    }, 150);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <ActivityIndicator size="small" />
      <Text style={{ marginTop: 12, color: "#6b7280" }}>Finalizing payment...</Text>
    </View>
  );
}
