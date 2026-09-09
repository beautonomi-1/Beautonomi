import { Modal, View, Text, TouchableOpacity, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";

type LoveTheAppSheetProps = {
  visible: boolean;
  stars: number;
  onRate: () => void;
  onNotNow: () => void;
  onDontAsk: () => void;
};

export function LoveTheAppSheet({ visible, stars, onRate, onNotNow, onDontAsk }: LoveTheAppSheetProps) {
  const { t } = useTranslation();
  const title = t("common.storeReview.title");
  const body = t("common.storeReview.body", { stars });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNotNow}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
        onPress={onNotNow}
      >
        <Pressable
          style={{
            backgroundColor: Colors.white,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 32,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 4, marginBottom: 16 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Ionicons
                key={n}
                name={n <= stars ? "star" : "star-outline"}
                size={28}
                color={n <= stars ? "#EAB308" : Colors.gray[300]}
              />
            ))}
          </View>
          <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], textAlign: "center", marginBottom: 8 }}>
            {title}
          </Text>
          <Text style={{ fontSize: 15, color: Colors.gray[600], textAlign: "center", lineHeight: 22, marginBottom: 24 }}>
            {body}
          </Text>
          <TouchableOpacity
            onPress={onRate}
            style={{
              backgroundColor: Colors.primary,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>{t("common.storeReview.rateApp")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNotNow} style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: Colors.gray[700], fontWeight: "600", fontSize: 15 }}>{t("common.storeReview.notNow")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDontAsk} style={{ paddingVertical: 8, alignItems: "center" }}>
            <Text style={{ color: Colors.gray[400], fontSize: 13 }}>{t("common.storeReview.dontAskAgain")}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
