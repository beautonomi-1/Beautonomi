import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { reviewedUiLanguageOptions, useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";

type Props = {
  value: string;
  onChange: (code: string) => void;
  marginBottom?: number;
};

export function ReviewedLanguageField({ value, onChange, marginBottom = 16 }: Props) {
  const { t } = useTranslation();
  const options = useMemo(() => reviewedUiLanguageOptions(), []);
  const [open, setOpen] = useState(false);
  const label =
    options.find((l) => l.code === value)?.nativeName ?? options[0]?.nativeName ?? "English";

  return (
    <>
      <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
        {t("auth.preferredLanguage")}
      </Text>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: Colors.gray[200],
          borderRadius: 12,
          backgroundColor: "#FAFAFA",
          paddingHorizontal: 14,
          paddingVertical: 14,
          marginBottom,
        }}
        accessibilityRole="button"
        accessibilityLabel={t("auth.preferredLanguage") as string}
      >
        <Text style={{ fontSize: 15, color: "#111827" }}>{label}</Text>
        <Ionicons name="chevron-down" size={18} color="#6B7280" />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: "70%",
              paddingBottom: 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: "700",
                color: "#111827",
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 12,
              }}
            >
              {t("auth.preferredLanguage")}
            </Text>
            <ScrollView>
              {options.map((lang) => {
                const selected = lang.code === value;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    onPress={() => {
                      onChange(lang.code);
                      setOpen(false);
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        color: selected ? Colors.primary : "#111827",
                        fontWeight: selected ? "700" : "400",
                      }}
                    >
                      {lang.nativeName}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
