/**
 * @beautonomi/ui — Shared Component Library
 *
 * This barrel exports shared types, constants, and utilities.
 * For platform-specific components use:
 *   - "@beautonomi/ui/native"  (React Native / Expo)
 *   - "@beautonomi/ui/web"     (Next.js / React DOM)
 */

export type {
  ButtonProps,
  ButtonVariant,
  ButtonSize,
  InputProps,
  CardProps,
  BadgeProps,
  EmptyStateProps,
  LoadingStateProps,
} from "./types";

export {
  getOfferEffectiveStatus,
  getStatusAccentColor,
  shouldShowCustomerAcceptCta,
  shouldShowCustomerResumeCta,
  shouldShowViewBookingCta,
  shouldShowWithdrawCta,
} from "./customOfferCardLogic";
export type {
  CustomOfferAttachmentBase,
  OfferStatusOverride,
  EffectiveOfferStatus,
  OfferBadge,
  StatusAccentColor,
} from "./customOfferCardLogic";
