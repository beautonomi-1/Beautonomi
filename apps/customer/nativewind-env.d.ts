/// <reference types="nativewind/types" />

/**
 * Manual fallback augmentation for NativeWind v4 className support.
 * Ensures TypeScript recognises the className prop on all React Native
 * components even when nativewind/types cannot be resolved in the
 * monorepo (e.g. hoisted node_modules).
 */
import "react-native";

declare module "react-native" {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface TouchableOpacityProps {
    className?: string;
  }
  interface PressableProps {
    className?: string;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface FlatListProps<ItemT> {
    className?: string;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface SectionListProps<ItemT, SectionT> {
    className?: string;
  }
  interface ModalProps {
    className?: string;
  }
  interface SafeAreaViewProps {
    className?: string;
  }
  interface ActivityIndicatorProps {
    className?: string;
  }
  interface SwitchProps {
    className?: string;
  }
  interface KeyboardAvoidingViewProps {
    className?: string;
  }
  interface RefreshControlProps {
    className?: string;
  }
}
