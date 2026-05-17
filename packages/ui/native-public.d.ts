/**
 * Type-only surface for `@beautonomi/ui/native`.
 * Keep this file free of `react` / `react-native` imports so Expo `tsc` does not
 * need those graphs when typechecking consumers.
 */
import type { CustomOfferAttachmentBase, OfferStatusOverride } from "./src/customOfferCardLogic";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  children?: unknown;
  onPress?: () => void;
}

export interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  error?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
}

export interface CardProps {
  children?: unknown;
  padding?: "none" | "sm" | "md" | "lg";
  shadow?: "none" | "sm" | "md" | "lg";
}

export interface BadgeProps {
  label: string;
  variant?: "default" | "success" | "warning" | "error" | "info";
}

export interface EmptyStateProps {
  icon?: unknown;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface LoadingStateProps {
  message?: string;
}

export type CustomOfferCardProps = {
  attachment: CustomOfferAttachmentBase;
  statusOverride?: OfferStatusOverride;
  isMe: boolean;
  role: "customer" | "provider";
  onPress?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onResume?: () => void;
  onWithdraw?: () => void;
  onViewBooking?: () => void;
  onContactSupport?: () => void;
  style?: unknown;
};

export declare function Button(props: ButtonProps): any;
export declare function Input(props: InputProps): any;
export declare function Card(props: CardProps): any;
export declare function Badge(props: BadgeProps): any;
export declare function EmptyState(props: EmptyStateProps): any;
export declare function LoadingState(props: LoadingStateProps): any;
export declare function CustomOfferCard(props: CustomOfferCardProps): any;

export interface ProviderGalleryImageProps {
  uri: string;
  width: number;
  borderRadius?: number;
  style?: unknown;
  priority?: "low" | "normal" | "high";
  accessibilityLabel?: string;
}

export declare function ProviderGalleryImage(props: ProviderGalleryImageProps): any;
