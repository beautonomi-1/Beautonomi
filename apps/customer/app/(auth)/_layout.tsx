import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/providers/AuthProvider";

export default function AuthLayout() {
  const { session, loading } = useAuth();

  // Show a loading indicator while auth state resolves — prevents blank white flash.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" }}>
        <ActivityIndicator size="large" color="#FF0077" />
      </View>
    );
  }

  // Already authenticated — root index.tsx will route to the correct screen
  // (onboarding, home, or profile completion) based on the user's state.
  if (session) return <Redirect href="/" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
