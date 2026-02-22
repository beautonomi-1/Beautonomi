import { redirect } from "next/navigation";

/**
 * Help centre URL: redirects to the main help page so "visit help centre" links work.
 */
export default function HelpCentrePage() {
  redirect("/help");
}
