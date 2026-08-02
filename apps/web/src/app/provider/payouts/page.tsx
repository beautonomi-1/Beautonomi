import { redirect } from "next/navigation";

/** Payout center consolidated into Finance — keep this route for bookmarks and notifications. */
export default function ProviderPayoutsRedirect() {
  redirect("/provider/finance?tab=payouts");
}
