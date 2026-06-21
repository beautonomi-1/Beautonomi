import { Platform } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";

export function KeyboardRootProvider({ children }: { children: React.ReactNode }) {
  if (Platform.OS === "web") return <>{children}</>;
  return <KeyboardProvider>{children}</KeyboardProvider>;
}
