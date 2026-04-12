export default function ReviewsLoading() {
  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 md:py-8">
      <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="h-5 w-24 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="bg-white rounded-2xl shadow-sm border p-6 md:p-8 mb-6">
          <div className="h-8 w-40 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-56 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border p-5 animate-pulse">
              <div className="flex items-center gap-2 mb-3">
                {[1, 2, 3, 4, 5].map((s) => (
                  <div key={s} className="h-5 w-5 bg-gray-100 rounded" />
                ))}
              </div>
              <div className="h-4 w-full bg-gray-100 rounded mb-2" />
              <div className="h-4 w-3/4 bg-gray-50 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
