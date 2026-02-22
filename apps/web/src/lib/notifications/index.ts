/**
 * Notification Service - Main Export
 * 
 * Export all notification functions for easy importing throughout the application
 */

// Core notification functions
export {
  sendToUser,
  sendToUsers,
  sendTemplateNotification,
  getNotificationTemplate,
  type NotificationChannel,
  type NotificationPayload,
  type SendNotificationResult,
} from "./onesignal";

// All notification service functions
export {
  // Booking Notifications
  notifyBookingConfirmed,
  notifyBookingReminder24h,
  notifyBookingReminder2h,
  notifyBookingCancelled,
  notifyBookingRescheduled,
  
  // At-Home Service Notifications
  notifyProviderEnRoute,
  notifyProviderArrivingSoon,
  notifyProviderArrived,
  notifyHomeServiceLocationDetails,
  notifyServiceLocationRequired,
  notifyServiceLocationChanged,
  notifyProviderNeedsDirections,
  notifyProviderLocationShared,
  
  // At-Salon Service Notifications
  notifySalonDirections,
  notifySalonArrivalReminder,
  notifyCustomerArrivedSalon,
  notifyWaitingArea,
  
  // Service Status Notifications
  notifyServiceStarted,
  notifyServiceInProgress,
  notifyServiceAlmostDone,
  notifyServiceExtended,
  notifyServiceCompleted,
  
  // Provider Status Notifications
  notifyProviderRunningLate,
  notifyProviderArrivedEarly,
  
  // Customer Status Notifications
  notifyCustomerRunningLate,
  notifyCustomerNoShow,
  
  // Payment Notifications
  notifyPaymentSuccessful,
  notifyPaymentFailed,
  notifyPaymentPending,
  notifyPaymentMethodExpired,
  notifyPartialPayment,
  notifyRefundProcessed,
  notifyInvoiceGenerated,
  notifyReceiptSent,
  
  // Provider Business Notifications
  notifyProviderNewBooking,
  notifyProviderNewCustomer,
  notifyProviderReturningCustomer,
  notifyProviderPreferredCustomer,
  notifyProviderPayoutProcessed,
  notifyProviderPayoutScheduled,
  notifyProviderPayoutFailed,
  notifyProviderWeeklyEarnings,
  notifyProviderAvailabilityChanged,
  notifyProviderHolidayMode,
  notifyProviderHolidayModeEnding,
  notifyProviderBreakScheduled,
  
  // Review Notifications
  notifyReviewReminder,
  notifyProviderNewReview,
  notifyBookingFollowUp,
  notifyThankYouAfterService,
  
  // Add-Ons & Extras
  notifyAddonAdded,
  notifyAddonRemoved,
  notifyServiceUpgradeOffered,
  
  // Travel Fees
  notifyTravelFeeApplied,
  
  // Time & Date Changes
  notifyBookingTimeChanged,
  notifyBookingDateChanged,
  
  // Account & Security
  notifyPasswordReset,
  notifyEmailVerification,
  notifyAccountSuspended,
  
  // Welcome & Promotional
  notifyWelcomeMessage,
  notifyPromotionAvailable,
  
  // Loyalty & Rewards
  notifyLoyaltyPointsEarned,
  notifyLoyaltyPointsRedeemed,
  notifyLoyaltyTierUpgraded,
  notifyReferralBonusEarned,
  notifyReferralCodeUsed,
  
  // Service Packages
  notifyServicePackagePurchased,
  notifyServicePackageExpiring,
  notifyServicePackageExpired,
  notifyServicePackageUsed,
  
  // Gift Cards
  notifyGiftCardPurchased,
  notifyGiftCardReceived,
  
  // Memberships & Subscriptions
  notifyMembershipRenewalReminder,
  notifyMembershipActivated,
  
  // Support & Messages
  notifyNewMessage,
  notifySupportTicketCreated,
  notifySupportTicketUpdated,
  
  // Disputes & Complaints
  notifyDisputeOpened,
  notifyDisputeResolved,
  notifyComplaintFiled,
  notifyQualityIssueReported,
  
  // Safety & Security
  notifySafetyCheckIn,
  notifySafetyAlert,
  
  // Special Requests & Instructions
  notifySpecialInstructionsAdded,
  notifyAllergyAlert,
  
  // Weather & External Factors
  notifyWeatherAlert,
  
  // Provider Onboarding
  notifyProviderOnboardingWelcome,
  notifyProviderProfileApproved,
  notifyProviderProfileRejected,
  
  // Customer Experience Enhancements
  notifyBookingWaitlistAvailable,
  notifyProviderRecommendation,
  notifyServiceSuggestion,
  
  // Emergency Cancellations
  notifyEmergencyCancellation,
} from "./notification-service";

// Mangomint-style appointment notification wrappers
export {
  sendRescheduleNotification,
  sendConfirmationNotification,
  sendCancellationNotification,
  sendReminderNotification,
  sendCheckInNotification,
  sendReadyNotification,
  resendNotification,
  type NotificationOptions,
  type NotificationResult,
  type NotificationType,
} from "./appointment-notifications";