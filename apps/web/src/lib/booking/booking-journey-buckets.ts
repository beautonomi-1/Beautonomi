import type { BookingStep } from "@/app/booking/components/booking-flow";

/** Customer-facing 5-bucket journey (express parity). */
export type BookingJourneyBucket = "services" | "venue" | "time" | "details" | "pay";

export const BOOKING_JOURNEY_BUCKETS: BookingJourneyBucket[] = [
  "services",
  "venue",
  "time",
  "details",
  "pay",
];

export function bookingStepToJourneyBucket(step: BookingStep): BookingJourneyBucket {
  switch (step) {
    case "services":
    case "groupParticipants":
      return "services";
    case "venue":
      return "venue";
    case "calendar":
    case "resources":
      return "time";
    case "promotions":
    case "yourInfo":
    case "forms":
      return "details";
    case "payment":
      return "pay";
    default:
      return "services";
  }
}

export function journeyBucketLabelKey(bucket: BookingJourneyBucket): string {
  return `web.booking.journey.bucket.${bucket}`;
}
