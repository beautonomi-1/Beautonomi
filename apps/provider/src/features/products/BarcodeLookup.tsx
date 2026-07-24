import { useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import {
  barcodeLookupQueryParams,
  mapApiErrorCodeToMessage,
  type BarcodeLookupApiPayload,
} from "./resolveBarcodeForWalkInSale";
import { Colors } from "@/constants/colors";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Catalogue-only: scan or type a code, then open the product editor (not sell). */
export function BarcodeLookupModal({ visible, onClose }: Props) {
  const router = useRouter();
  const [scanOpen, setScanOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const lookupCode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      setLookupBusy(true);
      setLookupError(null);
      try {
        const params = barcodeLookupQueryParams(code);
        const res = await api.fetch<BarcodeLookupApiPayload>(
          `/api/provider/products/by-barcode?${params.toString()}`,
        );
        if (res.error) {
          setLookupError(
            mapApiErrorCodeToMessage(res.error.code, res.error.message ?? "Lookup failed"),
          );
          return;
        }
        const productId = res.data?.product?.id;
        if (!productId) {
          setLookupError("No product found for this barcode or SKU");
          return;
        }
        setManualCode("");
        setScanOpen(false);
        onClose();
        router.push(`/(app)/(tabs)/more/product-form?id=${productId}` as never);
      } finally {
        setLookupBusy(false);
      }
    },
    [onClose, router],
  );

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={{ flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)", padding: 20 }}>
          <View style={{ borderRadius: 16, backgroundColor: "#fff", padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>
              Find product to edit
            </Text>
            <Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 16 }}>
              Scan or enter a barcode / SKU to open the product editor.
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <TextInput
                value={manualCode}
                onChangeText={setManualCode}
                placeholder="Barcode / SKU"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                editable={!lookupBusy}
                onSubmitEditing={() => void lookupCode(manualCode)}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                }}
              />
              <TouchableOpacity
                onPress={() => void lookupCode(manualCode)}
                disabled={lookupBusy}
                style={{
                  borderRadius: 12,
                  backgroundColor: "#4f46e5",
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  opacity: lookupBusy ? 0.6 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Look up product"
              >
                <Ionicons name="search" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setScanOpen(true)}
                disabled={lookupBusy}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#c4b5fd",
                  backgroundColor: "#f5f3ff",
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
                accessibilityRole="button"
                accessibilityLabel="Scan barcode with camera"
              >
                <Ionicons name="barcode-outline" size={22} color="#6d28d9" />
              </TouchableOpacity>
            </View>
            {lookupError ? (
              <Text style={{ fontSize: 12, color: "#B91C1C", marginBottom: 8 }}>{lookupError}</Text>
            ) : null}
            <TouchableOpacity
              onPress={onClose}
              style={{ marginTop: 8, alignItems: "center", paddingVertical: 10 }}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[600] }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <BarcodeScannerModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        title="Scan product barcode"
        busy={lookupBusy}
        errorMessage={lookupError}
        onScanned={(code) => {
          void lookupCode(code);
        }}
      />
    </>
  );
}
