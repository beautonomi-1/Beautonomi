import { redirect } from "next/navigation";

/** Canonical saved providers / wishlists live under account settings. */
export default function ExploreSavedRedirect() {
  redirect("/account-settings/wishlists");
}
