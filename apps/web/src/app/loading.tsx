import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";

/**
 * Root loading UI — shown during client navigation when a segment is loading.
 * Used across the app (including public pages) for consistent in-page loading.
 */
export default function RootLoading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-8" aria-busy="true" aria-live="polite">
      <BeautonomiLoadingIcon size={56} />
    </div>
  );
}
