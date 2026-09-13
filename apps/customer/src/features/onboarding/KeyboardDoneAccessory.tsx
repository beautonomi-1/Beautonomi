import { InputAccessoryView, View, Button, Platform, Keyboard } from "react-native";
import { useTranslation } from "@beautonomi/i18n";

type KeyboardDoneAccessoryProps = {
  nativeID: string;
  onNext?: () => void;
  onDone?: () => void;
};

export function KeyboardDoneAccessory({ nativeID, onNext, onDone }: KeyboardDoneAccessoryProps) {
  const { t } = useTranslation();
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 16,
          backgroundColor: "#F1F5F9",
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
      >
        {onNext ? <Button title={t("common.next")} onPress={onNext} /> : null}
        <Button
          title={t("common.done")}
          onPress={() => {
            onDone?.();
            Keyboard.dismiss();
          }}
        />
      </View>
    </InputAccessoryView>
  );
}
