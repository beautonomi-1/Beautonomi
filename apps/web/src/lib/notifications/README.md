# Notification Service

Comprehensive notification service for the Beautonomi platform. This service provides functions to trigger all notification templates across the platform.

## Overview

The notification service is built on top of OneSignal and supports multiple channels:
- **Push Notifications** - Mobile and web push notifications
- **Email** - HTML email notifications
- **SMS** - Text message notifications
- **Live Activities** - iOS Live Activities (for real-time updates)

## Quick Start

```typescript
import { notifyBookingConfirmed } from "@/lib/notifications";

// Send booking confirmation notification
await notifyBookingConfirmed(bookingId, ["push", "email"]);
```

## Available Notification Functions

### Booking Notifications

#### `notifyBookingConfirmed(bookingId, channels?)`
Sends confirmation when a booking is confirmed.
- **When to use**: After provider accepts a booking request
- **Channels**: push, email, sms

#### `notifyBookingReminder24h(bookingId, channels?)`
Sends reminder 24 hours before booking.
- **When to use**: Scheduled job 24 hours before booking time
- **Channels**: push, email

#### `notifyBookingReminder2h(bookingId, channels?)`
Sends reminder 2 hours before booking.
- **When to use**: Scheduled job 2 hours before booking time
- **Channels**: push, sms

#### `notifyBookingCancelled(bookingId, cancelledBy, refundInfo, channels?)`
Sends cancellation notification.
- **When to use**: When booking is cancelled (by customer, provider, or system)
- **Parameters**: 
  - `cancelledBy`: "customer" | "provider" | "system"
  - `refundInfo`: String describing refund status
- **Channels**: push, email, sms

#### `notifyBookingRescheduled(bookingId, oldDate, newDate, channels?)`
Sends rescheduling notification.
- **When to use**: When booking date/time is changed
- **Channels**: push, email, sms

### At-Home Service Notifications

#### `notifyProviderEnRoute(bookingId, estimatedArrival, channels?)`
Notifies customer that provider is on the way.
- **When to use**: When provider starts traveling to customer location
- **Channels**: push, sms

#### `notifyProviderArrivingSoon(bookingId, minutes, channels?)`
Notifies customer that provider is arriving soon.
- **When to use**: 15 minutes before provider arrival
- **Channels**: push, sms

#### `notifyProviderArrived(bookingId, channels?)`
Notifies customer that provider has arrived.
- **When to use**: When provider reaches customer location
- **Channels**: push, sms

#### `notifyHomeServiceLocationDetails(bookingId, channels?)`
Sends service location details for at-home booking.
- **When to use**: When at-home booking location is confirmed
- **Channels**: push, email

#### `notifyServiceLocationRequired(bookingId, channels?)`
Requests service address from customer.
- **When to use**: When at-home booking is missing service address
- **Channels**: push, email, sms

#### `notifyServiceLocationChanged(bookingId, oldAddress, newAddress, channels?)`
Notifies customer of location change.
- **When to use**: When service address is updated
- **Channels**: push, email, sms

#### `notifyProviderNeedsDirections(bookingId, channels?)`
Notifies customer that provider needs directions.
- **When to use**: When provider requests directions
- **Channels**: push, sms

#### `notifyProviderLocationShared(bookingId, trackingUrl, channels?)`
Shares provider's live location.
- **When to use**: When provider shares live location tracking
- **Channels**: push

### At-Salon Service Notifications

#### `notifySalonDirections(bookingId, channels?)`
Sends salon directions and parking info.
- **When to use**: When at-salon booking is confirmed
- **Channels**: push, email

#### `notifySalonArrivalReminder(bookingId, channels?)`
Reminds customer to arrive at salon.
- **When to use**: 1 hour before salon appointment
- **Channels**: push, sms

#### `notifyCustomerArrivedSalon(bookingId, channels?)`
Confirms customer arrival at salon.
- **When to use**: When customer checks in at salon
- **Channels**: push

#### `notifyWaitingArea(bookingId, waitingArea, channels?)`
Notifies customer about waiting area.
- **When to use**: When customer is in waiting area
- **Channels**: push

### Service Status Notifications

#### `notifyServiceStarted(bookingId, serviceDuration, channels?)`
Notifies that service has started.
- **When to use**: When provider starts the service
- **Channels**: push

#### `notifyServiceInProgress(bookingId, channels?)`
Mid-service check-in.
- **When to use**: Optional mid-service check-in
- **Channels**: push

#### `notifyServiceAlmostDone(bookingId, remainingTime, channels?)`
Notifies service is almost complete.
- **When to use**: When service is nearing completion
- **Channels**: push

#### `notifyServiceExtended(bookingId, extensionTime, newEndTime, additionalCharge, channels?)`
Notifies service duration extended.
- **When to use**: When service duration is extended
- **Channels**: push, email

#### `notifyServiceCompleted(bookingId, channels?)`
Notifies service completion.
- **When to use**: When service is completed
- **Channels**: push, email

### Provider Status Notifications

#### `notifyProviderRunningLate(bookingId, delayMinutes, newArrivalTime, channels?)`
Notifies customer that provider is running late.
- **When to use**: When provider is delayed
- **Channels**: push, sms

#### `notifyProviderArrivedEarly(bookingId, channels?)`
Notifies customer that provider arrived early.
- **When to use**: When provider arrives early
- **Channels**: push

### Customer Status Notifications

#### `notifyCustomerRunningLate(bookingId, channels?)`
Reminds customer they are running late.
- **When to use**: When customer is detected as running late
- **Channels**: push, sms

#### `notifyCustomerNoShow(bookingId, noShowFee, channels?)`
Notifies customer about no-show.
- **When to use**: When customer doesn't show up
- **Channels**: push, email, sms

### Payment Notifications

#### `notifyPaymentSuccessful(bookingId, amount, paymentMethod, transactionId, channels?)`
Notifies successful payment.
- **When to use**: After successful payment processing
- **Channels**: push, email

#### `notifyPaymentFailed(bookingId, amount, failureReason, channels?)`
Notifies payment failure.
- **When to use**: When payment processing fails
- **Channels**: push, email, sms

#### `notifyPaymentPending(bookingId, amount, paymentMethod, channels?)`
Notifies pending payment.
- **When to use**: When payment is pending
- **Channels**: push, email

#### `notifyPaymentMethodExpired(bookingId, amount, channels?)`
Notifies expired payment method.
- **When to use**: When payment method expires
- **Channels**: push, email, sms

#### `notifyPartialPayment(bookingId, partialAmount, remainingBalance, channels?)`
Notifies partial payment received.
- **When to use**: When partial payment is received
- **Channels**: push, email

#### `notifyRefundProcessed(bookingId, amount, refundReason, channels?)`
Notifies refund processed.
- **When to use**: After refund is processed
- **Channels**: push, email

#### `notifyInvoiceGenerated(bookingId, totalAmount, invoiceNumber, channels?)`
Notifies invoice generated.
- **When to use**: When invoice is created
- **Channels**: push, email

#### `notifyReceiptSent(bookingId, totalAmount, paymentDate, channels?)`
Notifies receipt sent.
- **When to use**: When receipt is generated
- **Channels**: push, email

### Provider Business Notifications

#### `notifyProviderNewBooking(bookingId, channels?)`
Notifies provider of new booking request.
- **When to use**: When customer creates a booking
- **Channels**: push, email

#### `notifyProviderNewCustomer(bookingId, channels?)`
Notifies provider of new customer (first booking).
- **When to use**: When new customer books for first time
- **Channels**: push, email

#### `notifyProviderReturningCustomer(bookingId, visitNumber, channels?)`
Notifies provider of returning customer.
- **When to use**: When returning customer books
- **Channels**: push, email

#### `notifyProviderPreferredCustomer(bookingId, totalBookings, channels?)`
Notifies provider of preferred customer booking.
- **When to use**: When preferred customer books
- **Channels**: push, email

#### `notifyProviderPayoutProcessed(providerId, amount, payoutDate, transactionId, channels?)`
Notifies provider payout processed.
- **When to use**: After payout is processed
- **Channels**: push, email

#### `notifyProviderPayoutScheduled(providerId, payoutAmount, payoutDate, paymentMethod, channels?)`
Notifies provider payout scheduled.
- **When to use**: When payout is scheduled
- **Channels**: push, email

#### `notifyProviderPayoutFailed(providerId, payoutAmount, failureReason, channels?)`
Notifies provider payout failed.
- **When to use**: When payout fails
- **Channels**: push, email, sms

#### `notifyProviderWeeklyEarnings(providerId, totalEarnings, completedBookings, pendingPayout, payoutDate, channels?)`
Sends weekly earnings summary.
- **When to use**: Weekly scheduled job
- **Channels**: push, email

#### `notifyProviderAvailabilityChanged(providerId, availabilityChanges, channels?)`
Notifies provider availability updated.
- **When to use**: When provider updates availability
- **Channels**: push, email

#### `notifyProviderHolidayMode(providerId, startDate, returnDate, channels?)`
Notifies provider holiday mode activated.
- **When to use**: When provider activates holiday mode
- **Channels**: push, email

#### `notifyProviderHolidayModeEnding(providerId, returnDate, channels?)`
Notifies provider holiday mode ending soon.
- **When to use**: 2 days before holiday mode ends
- **Channels**: push, email

#### `notifyProviderBreakScheduled(providerId, breakStart, breakEnd, channels?)`
Notifies provider break scheduled.
- **When to use**: When provider schedules a break
- **Channels**: push

### Review Notifications

#### `notifyReviewReminder(bookingId, channels?)`
Sends review reminder.
- **When to use**: After service completion
- **Channels**: push, email

#### `notifyProviderNewReview(reviewId, customerName, rating, reviewText, providerUserId, channels?)`
Notifies provider of new review.
- **When to use**: When customer submits review
- **Channels**: push, email

#### `notifyBookingFollowUp(bookingId, channels?)`
Sends follow-up for feedback.
- **When to use**: 2 hours after service completion
- **Channels**: push, email

#### `notifyThankYouAfterService(bookingId, channels?)`
Sends thank you message.
- **When to use**: After service completion
- **Channels**: push, email

### Add-Ons & Extras

#### `notifyAddonAdded(bookingId, addonName, addonPrice, newTotal, channels?)`
Notifies add-on service added.
- **When to use**: When add-on is added to booking
- **Channels**: push, email

#### `notifyAddonRemoved(bookingId, addonName, refundAmount, newTotal, channels?)`
Notifies add-on service removed.
- **When to use**: When add-on is removed
- **Channels**: push, email

#### `notifyServiceUpgradeOffered(bookingId, upgradeName, upgradePrice, upgradeBenefits, channels?)`
Notifies service upgrade offered.
- **When to use**: When upgrade is offered
- **Channels**: push, email

### Travel Fees

#### `notifyTravelFeeApplied(bookingId, travelFee, distance, totalAmount, channels?)`
Notifies travel fee applied.
- **When to use**: When travel fee is calculated
- **Channels**: push, email

### Time & Date Changes

#### `notifyBookingTimeChanged(bookingId, oldTime, newTime, channels?)`
Notifies booking time changed.
- **When to use**: When booking time is updated
- **Channels**: push, email, sms

#### `notifyBookingDateChanged(bookingId, oldDate, newDate, bookingTime, channels?)`
Notifies booking date changed.
- **When to use**: When booking date is updated
- **Channels**: push, email, sms

### Account & Security

#### `notifyPasswordReset(userId, resetToken, channels?)`
Sends password reset link.
- **When to use**: When user requests password reset
- **Channels**: email (default)

#### `notifyEmailVerification(userId, verificationToken, channels?)`
Sends email verification link.
- **When to use**: When new user signs up
- **Channels**: email (default)

#### `notifyAccountSuspended(userId, suspensionReason, channels?)`
Notifies account suspension.
- **When to use**: When account is suspended
- **Channels**: push, email

### Welcome & Promotional

#### `notifyWelcomeMessage(userId, channels?)`
Sends welcome message.
- **When to use**: When new user signs up
- **Channels**: push, email

#### `notifyPromotionAvailable(userIds, promotionTitle, promotionDescription, promoCode, discountAmount, expiryDate, promotionId, channels?)`
Notifies promotion available.
- **When to use**: When promotion is created/active
- **Channels**: push, email

### Loyalty & Rewards

#### `notifyLoyaltyPointsEarned(userId, points, totalPoints, providerName, bookingDate, channels?)`
Notifies loyalty points earned.
- **When to use**: After booking completion
- **Channels**: push, email

#### `notifyLoyaltyPointsRedeemed(userId, points, discountAmount, remainingPoints, channels?)`
Notifies loyalty points redeemed.
- **When to use**: When points are redeemed
- **Channels**: push, email

#### `notifyLoyaltyTierUpgraded(userId, newTier, oldTier, tierBenefits, channels?)`
Notifies loyalty tier upgraded.
- **When to use**: When customer reaches new tier
- **Channels**: push, email

#### `notifyReferralBonusEarned(userId, bonusAmount, referredName, referralCode, channels?)`
Notifies referral bonus earned.
- **When to use**: When referral code is used
- **Channels**: push, email

#### `notifyReferralCodeUsed(userId, referrerName, bonusAmount, channels?)`
Notifies referral code used.
- **When to use**: When someone uses referral code
- **Channels**: push, email

### Service Packages

#### `notifyServicePackagePurchased(userId, packageName, servicesIncluded, packageValue, expiryDate, packageId, channels?)`
Notifies package purchased.
- **When to use**: When package is purchased
- **Channels**: push, email

#### `notifyServicePackageExpiring(userId, packageName, expiryDate, remainingServices, packageId, channels?)`
Notifies package expiring soon.
- **When to use**: 7 days before expiry
- **Channels**: push, email

#### `notifyServicePackageExpired(userId, packageName, expiryDate, unusedServices, channels?)`
Notifies package expired.
- **When to use**: When package expires
- **Channels**: push, email

#### `notifyServicePackageUsed(userId, packageName, remainingServices, packageId, channels?)`
Notifies package service used.
- **When to use**: When service from package is used
- **Channels**: push

### Gift Cards

#### `notifyGiftCardPurchased(userId, giftCardAmount, recipientName, giftCardCode, channels?)`
Notifies gift card purchased.
- **When to use**: When gift card is purchased
- **Channels**: push, email

#### `notifyGiftCardReceived(userId, senderName, giftCardAmount, giftCardCode, message, channels?)`
Notifies gift card received.
- **When to use**: When gift card is sent to recipient
- **Channels**: push, email

### Memberships & Subscriptions

#### `notifyMembershipRenewalReminder(userId, membershipName, renewalDate, renewalAmount, channels?)`
Notifies membership renewal reminder.
- **When to use**: Before membership expires
- **Channels**: push, email

#### `notifyMembershipActivated(userId, membershipName, benefits, channels?)`
Notifies membership activated.
- **When to use**: When membership is activated
- **Channels**: push, email

### Support & Messages

#### `notifyNewMessage(userId, senderName, messagePreview, conversationId, channels?)`
Notifies new message.
- **When to use**: When new message is received
- **Channels**: push, email

#### `notifySupportTicketCreated(userId, ticketNumber, ticketSubject, ticketId, channels?)`
Notifies support ticket created.
- **When to use**: When support ticket is created
- **Channels**: push, email

#### `notifySupportTicketUpdated(userId, ticketNumber, updateMessage, ticketId, channels?)`
Notifies support ticket updated.
- **When to use**: When support ticket is updated
- **Channels**: push, email

### Disputes & Complaints

#### `notifyDisputeOpened(bookingId, disputeReason, disputeId, channels?)`
Notifies dispute opened.
- **When to use**: When dispute is opened
- **Channels**: push, email

#### `notifyDisputeResolved(bookingId, resolutionDetails, disputeOutcome, disputeId, channels?)`
Notifies dispute resolved.
- **When to use**: When dispute is resolved
- **Channels**: push, email

#### `notifyComplaintFiled(bookingId, complaintDescription, complaintId, channels?)`
Notifies complaint filed.
- **When to use**: When complaint is filed
- **Channels**: push, email

#### `notifyQualityIssueReported(bookingId, issueDescription, channels?)`
Notifies quality issue reported.
- **When to use**: When quality issue is reported
- **Channels**: push, email

### Safety & Security

#### `notifySafetyCheckIn(bookingId, channels?)`
Sends safety check-in (at-home service).
- **When to use**: After at-home service completion
- **Channels**: push, sms

#### `notifySafetyAlert(bookingId, channels?)`
Sends safety alert if check-in not confirmed.
- **When to use**: If safety check-in not confirmed
- **Channels**: push, sms

### Special Requests & Instructions

#### `notifySpecialInstructionsAdded(bookingId, instructions, channels?)`
Notifies special instructions added.
- **When to use**: When special instructions are added
- **Channels**: push, email

#### `notifyAllergyAlert(bookingId, allergies, channels?)`
Notifies provider of customer allergies.
- **When to use**: When customer has allergies
- **Channels**: push, email, sms

### Weather & External Factors

#### `notifyWeatherAlert(bookingId, weatherCondition, channels?)`
Notifies weather alert.
- **When to use**: When severe weather may affect booking
- **Channels**: push, email, sms

### Provider Onboarding

#### `notifyProviderOnboardingWelcome(providerUserId, channels?)`
Sends provider onboarding welcome.
- **When to use**: When provider signs up
- **Channels**: push, email

#### `notifyProviderProfileApproved(providerUserId, channels?)`
Notifies provider profile approved.
- **When to use**: When provider profile is approved
- **Channels**: push, email

#### `notifyProviderProfileRejected(providerUserId, rejectionReason, channels?)`
Notifies provider profile rejected.
- **When to use**: When provider profile is rejected
- **Channels**: push, email

### Customer Experience Enhancements

#### `notifyBookingWaitlistAvailable(userId, providerName, availableDate, availableTime, services, providerId, channels?)`
Notifies waitlist slot available.
- **When to use**: When waitlisted slot becomes available
- **Channels**: push, email, sms

#### `notifyProviderRecommendation(userId, providerName, specialties, rating, recommendationReason, providerId, channels?)`
Notifies provider recommendation.
- **When to use**: When provider is recommended
- **Channels**: push, email

#### `notifyServiceSuggestion(userId, suggestedService, providerName, servicePrice, serviceDescription, serviceId, channels?)`
Notifies service suggestion.
- **When to use**: When service is suggested
- **Channels**: push, email

### Emergency Cancellations

#### `notifyEmergencyCancellation(bookingId, emergencyReason, refundInfo, channels?)`
Notifies emergency cancellation.
- **When to use**: When booking is cancelled due to emergency
- **Channels**: push, email, sms

## Usage Examples

### Example 1: Booking Confirmation

```typescript
import { notifyBookingConfirmed } from "@/lib/notifications";

// After provider accepts booking
await notifyBookingConfirmed(bookingId, ["push", "email"]);
```

### Example 2: Provider En Route (At-Home Service)

```typescript
import { notifyProviderEnRoute } from "@/lib/notifications";

// When provider starts traveling
const estimatedArrival = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
await notifyProviderEnRoute(bookingId, estimatedArrival, ["push", "sms"]);
```

### Example 3: Payment Success

```typescript
import { notifyPaymentSuccessful } from "@/lib/notifications";

// After payment processing
await notifyPaymentSuccessful(
  bookingId,
  amount,
  "Credit Card",
  transactionId,
  ["push", "email"]
);
```

### Example 4: Scheduled Reminders

```typescript
import { notifyBookingReminder24h, notifyBookingReminder2h } from "@/lib/notifications";

// In a scheduled job (cron)
const bookings = await getUpcomingBookings();

for (const booking of bookings) {
  const hoursUntil = (booking.scheduled_at - Date.now()) / (1000 * 60 * 60);
  
  if (hoursUntil <= 24 && hoursUntil > 22) {
    await notifyBookingReminder24h(booking.id, ["push", "email"]);
  } else if (hoursUntil <= 2 && hoursUntil > 1.5) {
    await notifyBookingReminder2h(booking.id, ["push", "sms"]);
  }
}
```

## Error Handling

All notification functions return a `SendNotificationResult` object:

```typescript
{
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  notification_id?: string;
}
```

Example error handling:

```typescript
const result = await notifyBookingConfirmed(bookingId);

if (!result.success) {
  console.error("Failed to send notification:", result.error);
  // Handle error (log, retry, etc.)
}
```

## Channel Selection

Choose channels based on:
- **Urgency**: SMS for urgent (running late, safety alerts)
- **Rich Content**: Email for detailed information (invoices, receipts)
- **Real-time**: Push for immediate updates (arrivals, status changes)
- **User Preferences**: Respect user notification preferences

## Best Practices

1. **Always handle errors**: Check `result.success` before proceeding
2. **Use appropriate channels**: Don't send SMS for non-urgent notifications
3. **Respect user preferences**: Check user notification settings
4. **Batch when possible**: Use `sendToUsers` for multiple recipients
5. **Log notifications**: All notifications are automatically logged
6. **Test templates**: Ensure templates are enabled before using

## Template Variables

All templates support variable replacement using `{{variable_name}}` syntax. Variables are automatically replaced when calling notification functions.

Common variables:
- `{{provider_name}}` - Provider business name
- `{{customer_name}}` - Customer full name
- `{{booking_date}}` - Booking date
- `{{booking_time}}` - Booking time
- `{{booking_number}}` - Booking reference number
- `{{total_amount}}` - Total amount (formatted)
- `{{services}}` - List of services

See individual template definitions in the database for complete variable lists.
