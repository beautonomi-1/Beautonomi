import { redirect } from "next/navigation";

export default function ProviderAppointmentsRedirect() {
  redirect("/provider/bookings");
}
