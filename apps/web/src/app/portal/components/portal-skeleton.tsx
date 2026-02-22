export function PortalBookingSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-6 animate-pulse">
          <div className="border-b pb-4">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-2" />
            <div className="h-4 bg-gray-100 rounded w-1/4" />
          </div>
          <div className="flex gap-2">
            <div className="h-6 bg-gray-200 rounded-full w-24" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-5 w-5 bg-gray-200 rounded shrink-0" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-100 rounded w-24 mb-2" />
                  <div className="h-5 bg-gray-200 rounded w-40" />
                </div>
              </div>
            ))}
          </div>
          <div className="border-t pt-4">
            <div className="h-6 bg-gray-200 rounded w-32 mb-3" />
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-5 bg-gray-100 rounded w-1/3" />
                  <div className="h-4 bg-gray-100 rounded w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
