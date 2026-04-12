export default function NotificationsLoading() {
  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 md:py-8">
      <div className="w-full max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="h-5 w-24 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="bg-white rounded-2xl shadow-sm border p-6 md:p-8">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-4" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-gray-50">
                <div>
                  <div className="h-4 w-36 bg-gray-200 rounded animate-pulse mb-1" />
                  <div className="h-3 w-48 bg-gray-100 rounded animate-pulse" />
                </div>
                <div className="h-6 w-10 bg-gray-100 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
