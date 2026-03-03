import { Stack } from "expo-router";
import { RoleGate } from "@/components/RoleGate";
import { SingularLinkHandler } from "@/components/SingularLinkHandler";

export default function AppLayout() {
  return (
    <RoleGate>
      <SingularLinkHandler />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="account-settings" options={{ headerShown: false }} />
        <Stack.Screen name="partner-profile" options={{ headerShown: false }} />
        <Stack.Screen name="book" options={{ headerShown: false }} />
        <Stack.Screen name="book-checkout" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: true, title: "Chat" }} />
        <Stack.Screen name="explore-post" options={{ headerShown: true, title: "Post" }} />
        <Stack.Screen name="custom-request-create" options={{ headerShown: true, title: "Custom Request" }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: "Notifications" }} />
        <Stack.Screen name="booking-detail" options={{ headerShown: true, title: "Booking" }} />
        <Stack.Screen name="help" options={{ headerShown: true, title: "Help" }} />
        <Stack.Screen name="about" options={{ headerShown: true, title: "About Us" }} />
        <Stack.Screen name="gift-card-purchase" options={{ headerShown: true, title: "Buy Gift Card" }} />
        <Stack.Screen name="review-write" options={{ headerShown: true, title: "Write Review" }} />
        <Stack.Screen name="cart" options={{ headerShown: true, title: "Cart" }} />
        <Stack.Screen name="product-detail" options={{ headerShown: true, title: "Product" }} />
        <Stack.Screen name="product-orders" options={{ headerShown: false, title: "My Orders" }} />
        <Stack.Screen name="on-demand/waiting" options={{ headerShown: false }} />
        <Stack.Screen name="on-demand/result" options={{ headerShown: false }} />
      </Stack>
    </RoleGate>
  );
}
