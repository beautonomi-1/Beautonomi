import { I18nManager } from "react-native";

/** `textAlign: "right"` for trailing numeric/meta columns; mirrors correctly in RTL. */
export function endTextAlign(): "left" | "right" {
  return I18nManager.isRTL ? "left" : "right";
}
