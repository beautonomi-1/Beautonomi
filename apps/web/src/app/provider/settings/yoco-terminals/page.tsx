import { redirect } from "next/navigation";

/**
 * Legacy URL: Yoco is now managed under Sales → Yoco Integration and Yoco devices.
 * Redirect so bookmarks and old links land on the single settings surface (devices).
 */
export default function YocoTerminalsRedirect() {
  redirect("/provider/settings/sales/yoco-devices");
}
