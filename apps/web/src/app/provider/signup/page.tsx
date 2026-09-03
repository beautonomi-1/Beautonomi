import { redirect } from "next/navigation";

/**
 * Dedicated provider signup entry. Renders the shared /signup form with
 * persona preselected via `type=provider` (Part H).
 */
export default function ProviderSignupPage() {
  redirect("/signup?type=provider");
}
