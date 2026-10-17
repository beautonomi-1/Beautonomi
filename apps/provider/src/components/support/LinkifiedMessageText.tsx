import { Text, type StyleProp, type TextStyle } from "react-native";
import { splitMessageWithLinks } from "@beautonomi/utils";
import { Linking } from "react-native";
import { Colors } from "@/constants/colors";

export function LinkifiedMessageText({
  text,
  style,
  linkStyle,
  onOpenError,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  onOpenError?: () => void;
}) {
  const parts = splitMessageWithLinks(text);
  if (parts.length === 1 && parts[0]?.type === "text") {
    return <Text style={style}>{text}</Text>;
  }
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.type === "link" ? (
          <Text
            key={`${i}-l`}
            style={[style, linkStyle ?? { color: Colors.primary, textDecorationLine: "underline" }]}
            onPress={() => {
              Linking.openURL(p.value).catch(() => onOpenError?.());
            }}
            accessibilityRole="link"
          >
            {p.value}
          </Text>
        ) : (
          <Text key={`${i}-t`}>{p.value}</Text>
        ),
      )}
    </Text>
  );
}
