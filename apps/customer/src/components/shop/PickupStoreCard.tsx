import { View, Text, TouchableOpacity, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { StaticMapImage, openInMaps } from "@/components/StaticMapImage";
import { formatLocationOpenLabel } from "@/lib/shop/formatLocationOpenLabel";

export interface PickupStoreLocation {
  id?: string;
  name: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  working_hours?: unknown;
}

type Props = {
  location: PickupStoreLocation;
  timezone?: string | null;
  collectionNotes?: string | null;
  variant?: "compact" | "full";
  selected?: boolean;
  onPress?: () => void;
  showPhone?: boolean;
  showMap?: boolean;
  t: (key: string, opts?: Record<string, string | number>) => string;
  i18nPrefix?: string;
};

function fullAddress(loc: PickupStoreLocation): string {
  return [
    loc.address_line1,
    loc.address_line2,
    loc.city,
    loc.state,
    loc.postal_code,
    loc.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function PickupStoreCard({
  location,
  timezone,
  collectionNotes,
  variant = "full",
  selected,
  onPress,
  showPhone = false,
  showMap = false,
  t,
  i18nPrefix = "customer.mobile.shop.pickupStore",
}: Props) {
  const hoursLabel = formatLocationOpenLabel(
    { working_hours: location.working_hours, timezone },
    t,
    "customer.mobile.shop.locationHours",
  );
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const addressQuery = fullAddress(location);

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        borderWidth: variant === "full" && selected != null ? 1.5 : 1,
        borderColor: selected ? Colors.primary : "#E5E7EB",
        borderRadius: 12,
        padding: variant === "compact" ? 10 : 14,
        backgroundColor: selected ? "rgba(255,0,119,0.04)" : "#fff",
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: variant === "compact" ? 14 : 16, fontWeight: "700", color: "#111827" }}>
        {location.name}
      </Text>
      {variant === "compact" ? (
        <>
          <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
            {[location.address_line1, location.city].filter(Boolean).join(", ")}
          </Text>
          <Text style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>{hoursLabel}</Text>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 4, lineHeight: 18 }}>{addressQuery}</Text>
          <Text style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>{hoursLabel}</Text>
          {collectionNotes ? (
            <View style={{ marginTop: 8, backgroundColor: "#FFF7ED", borderRadius: 8, padding: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#C2410C" }}>
                {t(`${i18nPrefix}.pickupInstructions`)}
              </Text>
              <Text style={{ fontSize: 12, color: "#92400E", marginTop: 2, lineHeight: 17 }}>{collectionNotes}</Text>
            </View>
          ) : null}
          {showMap && hasCoords ? (
            <View style={{ marginTop: 10, borderRadius: 10, overflow: "hidden", height: 120 }}>
              <StaticMapImage latitude={lat} longitude={lng} width={400} height={120} borderRadius={10} />
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => {
                void openInMaps({
                  latitude: hasCoords ? lat : undefined,
                  longitude: hasCoords ? lng : undefined,
                  query: addressQuery,
                });
              }}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <Ionicons name="navigate-outline" size={16} color={Colors.primary} />
              <Text style={{ marginStart: 4, color: Colors.primary, fontWeight: "600", fontSize: 13 }}>
                {t(`${i18nPrefix}.directions`)}
              </Text>
            </TouchableOpacity>
            {showPhone && location.phone ? (
              <TouchableOpacity
                onPress={() => {
                  const tel = location.phone!.replace(/\s/g, "");
                  void Linking.openURL(`tel:${tel}`);
                }}
                style={{ flexDirection: "row", alignItems: "center" }}
              >
                <Ionicons name="call-outline" size={16} color={Colors.primary} />
                <Text style={{ marginStart: 4, color: Colors.primary, fontWeight: "600", fontSize: 13 }}>
                  {t(`${i18nPrefix}.call`)}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      )}
    </Wrapper>
  );
}
