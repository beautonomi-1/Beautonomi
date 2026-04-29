/**
 * Web: map pin uses native Google/Apple maps SDK — prompt users to use search instead.
 */
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";

export type AddressMapPinModalProps = {
  visible: boolean;
  onClose: () => void;
  onPickCoordinates: (latitude: number, longitude: number) => void;
  initialCoordinate?: { latitude: number; longitude: number } | null;
};

export function AddressMapPinModal({ visible, onClose }: AddressMapPinModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.webBackdrop}>
        <SafeAreaView style={styles.webCard}>
          <Text style={styles.webTitle}>Map pin</Text>
          <Text style={styles.webBody}>
            Dropping a pin on the map is available in the iOS and Android app. Use search or current location above.
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.webButton} accessibilityRole="button">
            <Text style={styles.webButtonText}>OK</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  webCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
  },
  webTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.gray[900],
    marginBottom: 10,
  },
  webBody: {
    fontSize: 15,
    color: Colors.gray[600],
    lineHeight: 22,
    marginBottom: 20,
  },
  webButton: {
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  webButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.primary,
  },
});
