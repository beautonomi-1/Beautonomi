import { redirect } from "next/navigation";

/** Beautonomi (PayCloud) machines — same surface as the main card-machines settings page. */
export default function CardMachinesBeautonomiRedirect() {
  redirect("/provider/settings/sales/card-machines");
}
