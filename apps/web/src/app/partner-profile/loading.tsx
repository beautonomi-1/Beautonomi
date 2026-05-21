import { Skeleton } from "@/components/ui/skeleton";

/** Shown during RSC resolution — matches page chrome to reduce layout jump */
export default function PartnerProfileLoading() {
  return (
    <div
      className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full"
      aria-busy="true"
      aria-label="Loading provider profile"
    >
      <div className="h-[73px] md:h-[88px] border-b border-gray-100 bg-white shrink-0" />
      <div className="w-full max-w-full overflow-x-hidden max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20 py-6 md:py-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
            <Skeleton className="w-full md:w-2/5 aspect-[4/5] rounded-xl shrink-0" />
          <div className="space-y-4 flex-1">
            <Skeleton className="h-8 w-3/4 max-w-md" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full max-w-lg" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
        </div>
        <Skeleton className="h-12 w-full max-w-2xl rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
