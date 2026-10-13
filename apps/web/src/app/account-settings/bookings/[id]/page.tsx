import { Suspense } from "react";
import { NativeAppCheckoutBounce } from "@/components/payments/NativeAppCheckoutBounce";
import BookingsIdPageClient from "./BookingsIdPageClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <Suspense fallback={null}>
        <NativeAppCheckoutBounce />
      </Suspense>
      <BookingsIdPageClient />
    </>
  );
}
