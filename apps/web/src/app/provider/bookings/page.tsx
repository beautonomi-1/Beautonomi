import { BookingsClient } from "./BookingsClient";
import { fetchBookingsInitial } from "./fetch-bookings-initial";

export const dynamic = "force-dynamic";

export default async function ProviderBookingsPage() {
  const { bookings, error } = await fetchBookingsInitial();
  return <BookingsClient initialBookings={bookings} initialError={error} />;
}
