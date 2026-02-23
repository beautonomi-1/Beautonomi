import { redirect } from "next/navigation";

/**
 * Root control-plane segment: redirect to overview so the menu item and
 * direct /admin/control-plane visits both land on the overview page.
 */
export default function ControlPlaneRootPage() {
  redirect("/admin/control-plane/overview");
}
