import { Suspense } from "react";
import AccountSettingsClient from "./account-settings-client";

export default function AccountSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] max-w-5xl mx-auto px-4 py-10 md:px-6">
          <div className="mb-8 h-9 w-48 max-w-full rounded bg-gray-200/80 animate-pulse" />
          <div className="mb-6 space-y-3 rounded-2xl border border-gray-100 bg-gray-50/90 p-6 md:p-8">
            <div className="mx-auto h-20 w-20 rounded-full bg-gray-200/70 animate-pulse" />
            <div className="mx-auto h-4 w-40 rounded bg-gray-200/60 animate-pulse" />
            <div className="h-3 w-full max-w-md mx-auto rounded bg-gray-100 animate-pulse" />
          </div>
        </div>
      }
    >
      <AccountSettingsClient />
    </Suspense>
  );
}
