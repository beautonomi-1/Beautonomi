import { redirect } from "next/navigation";

/** Legacy finance hub consolidated into the main Finance page. */
export default function FinanceHubRedirect() {
  redirect("/provider/finance");
}
