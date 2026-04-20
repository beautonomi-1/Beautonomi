import { Redirect } from "expo-router";

/**
 * Legacy alias — bookings list & flows live under `more/bookings/`.
 */
export default function BookingsCalendarHubRedirect() {
  return <Redirect href="/(app)/(tabs)/more/bookings" />;
}
