import { Suspense } from "react";
import AuthCallbackCompleteClient from "./AuthCallbackCompleteClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackCompleteClient />
    </Suspense>
  );
}
