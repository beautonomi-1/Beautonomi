import { useState } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Colors } from "@/constants/colors";
import { haptic } from "@/lib/haptics";
import {
  formatBookingSupportLabel,
  getBookingSupportPrompt,
  type BookingSupportAudience,
} from "@beautonomi/utils";

type Props = {
  bookingId: string;
  bookingNumber?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  outstandingBalance?: number | null;
  audience?: BookingSupportAudience;
  onContactSupport: (category: string) => void;
};

export function BookingReferencePanel({
  bookingId,
  bookingNumber,
  status,
  paymentStatus,
  outstandingBalance,
  audience = "customer",
  onContactSupport,
}: Props) {
  const number = String(bookingNumber ?? "").trim();
  const prompt = getBookingSupportPrompt({
    status,
    paymentStatus,
    outstandingBalance,
    audience,
  });
  const supportLabel = formatBookingSupportLabel({ bookingNumber: number, bookingId });
  const [copied, setCopied] = useState<"number" | "id" | "both" | null>(null);
  const urgent = prompt.prominence === "urgent";

  async function copy(text: string, which: "number" | "id" | "both", _label: string) {
    haptic.success();
    await Clipboard.setStringAsync(text);
    setCopied(which);
  }

  const CopyChip = ({
    which,
    text,
    label,
  }: {
    which: "number" | "id" | "both";
    text: string;
    label: string;
  }) => (
    <TouchableOpacity
      onPress={() => void copy(text, which, label)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.gray[200],
        backgroundColor: Colors.white,
        paddingHorizontal: 10,
        paddingVertical: 7,
      }}
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
    >
      <Ionicons
        name={copied === which ? "checkmark" : "copy-outline"}
        size={14}
        color={copied === which ? "#16a34a" : Colors.gray[700]}
      />
      <Text style={{ fontSize: 12, fontWeight: "600", color: copied === which ? "#16a34a" : Colors.gray[700] }}>
        {copied === which ? "Copied" : "Copy"}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ marginBottom: 16 }}>
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: Colors.gray[200],
          backgroundColor: Colors.white,
          padding: 16,
        }}
      >
        {number ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[500], textTransform: "uppercase", letterSpacing: 0.4 }}>
                Booking number
              </Text>
              <Text
                selectable
                style={{ marginTop: 4, fontSize: 22, fontWeight: "700", color: Colors.gray[900], letterSpacing: -0.3 }}
              >
                {number}
              </Text>
            </View>
            <CopyChip which="number" text={number} label="Booking number" />
          </View>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginTop: number ? 14 : 0,
            paddingTop: number ? 14 : 0,
            borderTopWidth: number ? 1 : 0,
            borderTopColor: Colors.gray[100],
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[500], textTransform: "uppercase", letterSpacing: 0.4 }}>
              Booking ID
            </Text>
            <Text
              selectable
              style={{
                marginTop: 4,
                fontSize: 13,
                color: Colors.gray[800],
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              }}
            >
              {bookingId}
            </Text>
          </View>
          <CopyChip which="id" text={bookingId} label="Booking ID" />
        </View>

        {number ? (
          <TouchableOpacity
            onPress={() => void copy(supportLabel, "both", "Booking reference")}
            style={{ marginTop: 12, alignSelf: "flex-end" }}
            accessibilityRole="button"
            accessibilityLabel="Copy booking number and ID"
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500] }}>
              {copied === "both" ? "Number and ID copied" : "Copy number and ID"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View
        style={{
          marginTop: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: urgent ? "#FCD34D" : Colors.gray[200],
          backgroundColor: urgent ? "#FFFBEB" : Colors.gray[50],
          padding: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <Ionicons
            name="help-circle-outline"
            size={20}
            color={urgent ? "#B45309" : Colors.gray[500]}
            style={{ marginRight: 10, marginTop: 1 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: urgent ? "#78350F" : Colors.gray[900] }}>
              {prompt.title}
            </Text>
            <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 18, color: urgent ? "#92400E" : Colors.gray[600] }}>
              {prompt.body}
            </Text>
            <TouchableOpacity
              onPress={() => {
                haptic.light();
                onContactSupport(prompt.category);
              }}
              style={{
                marginTop: 12,
                alignSelf: "flex-start",
                borderRadius: 10,
                backgroundColor: urgent ? "#92400E" : Colors.white,
                borderWidth: urgent ? 0 : 1,
                borderColor: Colors.gray[200],
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
              accessibilityRole="button"
              accessibilityLabel="Contact support"
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: urgent ? "#fff" : Colors.gray[800] }}>
                Contact support
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}
