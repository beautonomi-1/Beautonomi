import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";

export default function ExplorePostLoading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-8" aria-busy="true" aria-live="polite">
      <BeautonomiLoadingIcon size={56} />
    </div>
  );
}
