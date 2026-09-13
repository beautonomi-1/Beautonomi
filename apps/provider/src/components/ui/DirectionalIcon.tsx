import type { ComponentProps } from "react";
import { I18nManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type IoniconsProps = ComponentProps<typeof Ionicons>;

const SWAP_PAIRS: [string, string][] = [
  ["chevron-forward", "chevron-back"],
  ["chevron-forward-outline", "chevron-back-outline"],
  ["chevron-forward-circle", "chevron-back-circle"],
  ["chevron-forward-circle-outline", "chevron-back-circle-outline"],
  ["chevron-forward-sharp", "chevron-back-sharp"],
  ["arrow-forward", "arrow-back"],
  ["arrow-forward-outline", "arrow-back-outline"],
  ["arrow-forward-circle", "arrow-back-circle"],
  ["arrow-forward-sharp", "arrow-back-sharp"],
];

function resolveDirectionalName(name: IoniconsProps["name"]): IoniconsProps["name"] {
  if (!I18nManager.isRTL || typeof name !== "string") return name;
  for (const [fwd, back] of SWAP_PAIRS) {
    if (name === fwd) return back as IoniconsProps["name"];
    if (name === back) return fwd as IoniconsProps["name"];
  }
  return name;
}

/** Ionicons wrapper that mirrors forward/back chevrons and arrows in RTL. */
export function DirectionalIcon(props: IoniconsProps) {
  const resolved = resolveDirectionalName(props.name);
  return <Ionicons {...props} name={resolved} />;
}
