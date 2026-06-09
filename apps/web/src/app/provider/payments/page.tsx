import { redirect } from "next/navigation";

/** Booking payment search consolidated into Finance — keep this route for bookmarks. */
export default function ProviderPaymentsRedirect() {
  redirect("/provider/finance?view=payments");
}
