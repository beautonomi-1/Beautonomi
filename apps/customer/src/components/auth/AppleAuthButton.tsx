import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";

type AppleAuthButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

/**
 * HIG Sign in with Apple button (iOS only). Callers should fall back to a custom row on Android/web.
 */
export function AppleAuthButton({ onPress, disabled, style }: AppleAuthButtonProps) {
  if (Platform.OS !== "ios") return null;

  return (
    <View
      pointerEvents={disabled ? "none" : "auto"}
      style={[styles.wrap, style, disabled ? styles.disabled : null]}
    >
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={12}
        style={styles.button}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginBottom: 12,
  },
  button: {
    width: "100%",
    height: 50,
  },
  disabled: {
    opacity: 0.55,
  },
});
