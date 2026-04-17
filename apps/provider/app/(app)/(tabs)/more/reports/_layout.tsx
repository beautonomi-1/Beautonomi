import { Stack } from "expo-router";

export default function ReportsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="revenue" />
      <Stack.Screen name="bookings" />
      <Stack.Screen name="clients" />
      <Stack.Screen name="staff" />
      <Stack.Screen name="payments" />
      <Stack.Screen name="products" />
      <Stack.Screen name="services" />
      <Stack.Screen name="gift-cards" />
      <Stack.Screen name="packages" />
      <Stack.Screen name="business" />
      <Stack.Screen name="detail/[reportId]" />
    </Stack>
  );
}
