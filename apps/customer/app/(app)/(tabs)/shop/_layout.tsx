import { Stack } from "expo-router";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";

export default function ShopStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: Colors.primary,
        headerBackTitle: "",
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: t("customer.mobile.stackTitles.shop"), headerShown: false }}
      />
      <Stack.Screen
        name="product-checkout"
        options={{ title: t("customer.mobile.stackTitles.checkout") }}
      />
    </Stack>
  );
}
