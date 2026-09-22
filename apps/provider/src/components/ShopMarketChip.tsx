import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getShopMarketCountry } from "@/lib/market/shop-market-opt-in";

export function ShopMarketChip() {
  const insets = useSafeAreaInsets();
  const [iso, setIso] = useState<string | null>(null);

  useEffect(() => {
    void getShopMarketCountry().then(setIso);
  }, []);

  if (!iso) return null;

  const label = iso === "ZA" ? "Shopping South Africa" : `Shopping ${iso}`;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: insets.top + 4,
        alignSelf: "center",
        zIndex: 50,
        backgroundColor: "rgba(17, 24, 39, 0.92)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}
