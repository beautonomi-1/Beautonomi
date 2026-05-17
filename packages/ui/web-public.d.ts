/**
 * Type-only surface for `@beautonomi/ui/web` (see `native-public.d.ts`).
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
  onClick?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onResume?: () => void;
  onWithdraw?: () => void;
  onEdit?: () => void;
  onViewBooking?: () => void;
  onContactSupport?: () => void;
  isDeclineLoading?: boolean;
  className?: string;
};

export declare function Button(props: ButtonProps): any;
export declare function Input(props: InputProps): any;
export declare function Card(props: CardProps): any;
export declare function Badge(props: BadgeProps): any;
export declare function EmptyState(props: EmptyStateProps): any;
export declare function LoadingState(props: LoadingStateProps): any;
export declare function CustomOfferCard(props: CustomOfferCardProps): any;

export interface ProviderGalleryImageProps {
  src: string;
  alt: string;
  className?: string;
  frameClassName?: string;
  priority?: boolean;
  loading?: "eager" | "lazy";
  sizes?: string;
}

export declare function ProviderGalleryImage(props: ProviderGalleryImageProps): any;
