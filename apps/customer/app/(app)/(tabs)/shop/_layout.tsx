import { Stack } from "expo-router";
import { Colors } from "@/constants/colors";

export default function ShopStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: Colors.primary,
        headerBackTitle: "",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Shop", headerShown: false }} />
      <Stack.Screen name="product-checkout" options={{ title: "Checkout" }} />
    </Stack>
  );
}
