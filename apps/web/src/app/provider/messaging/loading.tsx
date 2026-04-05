import { Skeleton } from "@/components/ui/skeleton";

export default function MessagingLoading() {
  return (
    <div className="flex h-full" aria-busy="true">
      <div className="w-full md:w-80 border-r p-4 space-y-3">
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden md:flex flex-1 items-center justify-center">
        <Skeleton className="h-6 w-48" />
      </div>
    </div>
  );
}
