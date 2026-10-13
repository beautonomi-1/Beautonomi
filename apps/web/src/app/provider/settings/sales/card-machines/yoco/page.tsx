import { redirect } from "next/navigation";

/** Unified hub sub-route → Yoco OAuth and device settings. */
export default function CardMachinesYocoRedirect() {
  redirect("/provider/settings/sales/yoco-integration");
}
