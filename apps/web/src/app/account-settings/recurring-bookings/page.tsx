import RecurringBookingsPageClient from "./RecurringBookingsPageClient";
import { fetchRecurringBookingsInitial } from "./fetch-recurring-bookings-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialRecurring = await fetchRecurringBookingsInitial();
  return <RecurringBookingsPageClient initialRecurring={initialRecurring} />;
}
