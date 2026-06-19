import { InputAccessoryView, View, Button, Platform, Keyboard } from "react-native";

type KeyboardDoneAccessoryProps = {
  nativeID: string;
  onNext?: () => void;
  onDone?: () => void;
};

export function KeyboardDoneAccessory({ nativeID, onNext, onDone }: KeyboardDoneAccessoryProps) {
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
        {onNext ? <Button title="Next" onPress={onNext} /> : null}
        <Button
          title="Done"
          onPress={() => {
            onDone?.();
            Keyboard.dismiss();
          }}
        />
      </View>
    </InputAccessoryView>
  );
}
