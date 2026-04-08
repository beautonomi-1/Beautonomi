import { redirect } from "next/navigation";

/** Main profile UI lives on `/account-settings` (faster client-driven hub). */
export default function ProfileIndexRedirect() {
  redirect("/account-settings");
}
