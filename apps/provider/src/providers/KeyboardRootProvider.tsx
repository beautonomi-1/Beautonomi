import { createContext, useContext, useRef, type RefObject } from "react";
import { Platform, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";

const KeyboardRootRefContext = createContext<RefObject<View | null> | null>(null);

export function useKeyboardRootRef(): RefObject<View | null> | null {
  return useContext(KeyboardRootRefContext);
}

export function KeyboardRootProvider({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<View | null>(null);
  if (Platform.OS === "web") {
    return <KeyboardRootRefContext.Provider value={null}>{children}</KeyboardRootRefContext.Provider>;
  }
  return (
    <KeyboardRootRefContext.Provider value={rootRef}>
      <KeyboardProvider>
        <View ref={rootRef} collapsable={false} style={{ flex: 1 }}>
          {children}
        </View>
      </KeyboardProvider>
    </KeyboardRootRefContext.Provider>
  );
}