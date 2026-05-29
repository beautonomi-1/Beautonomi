import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { twStyle } from "@/lib/twStyle";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import type { CustomerBookingTierPreview } from "./types";

interface BookingTierCustomerPreviewProps {
  tiers: CustomerBookingTierPreview[];
  serviceTitle?: string;
}

/** Mimics the pill-style option picker customers see at booking (multi-tier only). */
export function BookingTierCustomerPreview({ tiers, serviceTitle }: BookingTierCustomerPreviewProps) {
  if (tiers.length === 0) return null;

  const currency = getTenantDefaultCurrency();

  return (
    <View
      style={twStyle("mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3.5")}
      accessibilityRole="summary"
      accessibilityLabel={`Customers choose from ${tiers.length} booking options`}
    >
      <View style={twStyle("mb-2.5 flex-row items-center gap-2")}>
        <View style={twStyle("rounded-full bg-indigo-100 p-1.5")}>
          <Ionicons name="eye-outline" size={16} color="#4f46e5" />
        </View>
        <View style={twStyle("flex-1")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-indigo-700")}>
            Customer booking view
          </Text>
          <Text style={twStyle("text-xs text-indigo-600/90")}>
            {tiers.length} option{tiers.length === 1 ? "" : "s"} to choose from
            {serviceTitle ? ` · ${serviceTitle}` : ""}
          </Text>
        </View>
      </View>
      <View style={twStyle("flex-row flex-wrap gap-2")}>
        {tiers.map((tier) => (
          <View
            key={`${tier.name}-${tier.durationMinutes}-${tier.price}`}
            style={twStyle("rounded-xl border border-indigo-200/80 bg-white px-3 py-2 min-w-[44%] flex-1")}
          >
            <Text style={twStyle("text-sm font-semibold text-gray-900")} numberOfLines={1}>
              {tier.name}
            </Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
              {formatCurrency(tier.price, currency)}
              {tier.durationMinutes ? ` · ${tier.durationMinutes} min` : ""}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
