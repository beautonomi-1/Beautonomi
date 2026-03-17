/**
 * Rounded modal prompting to save a location (e.g. from address bar / current location)
 * with label (Home, Work, Other) and full address + geocode persistence.
 */
import { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import type { AddressPickerSelection } from "./AddressPicker";

const LABELS = [
  { id: "Home", icon: "home-outline" as const },
  { id: "Work", icon: "briefcase-outline" as const },
  { id: "Other", icon: "location-outline" as const },
] as const;

export type SaveAddressPayload = {
  label: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country: string;
  latitude: number;
  longitude: number;
  is_default: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  selection: AddressPickerSelection | null;
  addressCount: number;
  onSaveAndUse: (payload: SaveAddressPayload) => Promise<void>;
  onJustUse: () => void;
};

export function SaveAddressModal({
  visible,
  onClose,
  selection,
  addressCount,
  onSaveAndUse,
  onJustUse,
}: Props) {
  const [selectedLabel, setSelectedLabel] = useState<string>("Home");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setSelectedLabel("Home");
  }, [visible]);

  if (!selection?.structured) return null;

  const structured = selection.structured;
  const fullAddressLine =
    [structured.address_line1, structured.address_line2, structured.city, structured.state, structured.postal_code, structured.country]
      .filter(Boolean)
      .join(", ");

  const handleSaveAndUse = async () => {
    const label = selectedLabel.trim() || "Home";
    setSaving(true);
    try {
      await onSaveAndUse({
        label,
        address_line1: structured.address_line1,
        address_line2: structured.address_line2 ?? null,
        city: structured.city,
        state: structured.state ?? null,
        postal_code: structured.postal_code ?? null,
        country: structured.country,
        latitude: selection.latitude,
        longitude: selection.longitude,
        is_default: addressCount === 0,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleJustUse = () => {
    onJustUse();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.iconWrap}>
            <Ionicons name="location" size={32} color={Colors.primary} />
          </View>
          <Text style={styles.title}>Save this location?</Text>
          <Text style={styles.subtitle}>
            Store it for quick access next time (e.g. Home, Work).
          </Text>

          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Address</Text>
            <Text style={styles.addressText} numberOfLines={3}>
              {fullAddressLine || selection.displayName}
            </Text>
          </View>

          <Text style={styles.labelHeading}>Label</Text>
          <View style={styles.labelRow}>
            {LABELS.map((l) => (
              <TouchableOpacity
                key={l.id}
                onPress={() => setSelectedLabel(l.id)}
                style={[
                  styles.labelPill,
                  selectedLabel === l.id && styles.labelPillActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Label: ${l.id}`}
                accessibilityState={{ selected: selectedLabel === l.id }}
              >
                <Ionicons
                  name={l.icon}
                  size={18}
                  color={selectedLabel === l.id ? Colors.white : Colors.gray[600]}
                />
                <Text
                  style={[
                    styles.labelPillText,
                    selectedLabel === l.id && styles.labelPillTextActive,
                  ]}
                >
                  {l.id}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={handleSaveAndUse}
            disabled={saving}
            style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Save and use this address"
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
                <Text style={styles.primaryButtonText}>Save & use</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleJustUse}
            disabled={saving}
            style={styles.secondaryButton}
            accessibilityRole="button"
            accessibilityLabel="Use without saving"
          >
            <Text style={styles.secondaryButtonText}>Just use for now</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Colors.white,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    marginBottom: 16,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.gray[900],
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: Colors.gray[500],
    textAlign: "center",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  addressBlock: {
    alignSelf: "stretch",
    backgroundColor: Colors.gray[50],
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  addressText: {
    fontSize: 14,
    color: Colors.gray[800],
    lineHeight: 20,
  },
  labelHeading: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.gray[700],
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  labelRow: {
    flexDirection: "row",
    marginBottom: 22,
    marginHorizontal: -5,
  },
  labelPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 5,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  labelPillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  labelPillText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.gray[600],
    marginLeft: 6,
  },
  labelPillTextActive: {
    color: Colors.primary,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.white,
  },
  secondaryButton: {
    alignSelf: "stretch",
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.gray[500],
  },
});
