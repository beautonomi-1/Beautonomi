import BookingsPageClient from "./BookingsPageClient";
import { fetchBookingsUpcomingInitial } from "./fetch-bookings-initial";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const initialUpcoming = await fetchBookingsUpcomingInitial();
  return <BookingsPageClient initialUpcoming={initialUpcoming} />;
}
