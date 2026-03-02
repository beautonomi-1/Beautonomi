/// <reference types="nativewind/types" />
/* eslint-disable @typescript-eslint/no-unused-vars -- type params required by RN interfaces */
/**
 * Manual fallback augmentation for NativeWind v4 className support.
 * Ensures TypeScript recognises the className prop on React Native
 * components when nativewind/types cannot be resolved in the monorepo.
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
  interface FlatListProps<_ItemT> {
    className?: string;
  }
  interface SectionListProps<_ItemT, _SectionT> {
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
