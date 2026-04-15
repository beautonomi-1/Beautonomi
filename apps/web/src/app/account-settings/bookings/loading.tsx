export default function BookingsLoading() {
  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 md:py-8">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="h-5 w-24 bg-gray-200 rounded mb-4" />
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 md:p-8 mb-6">
          <div className="h-9 w-40 bg-gray-200 rounded mb-2" />
          <div className="h-4 w-64 bg-gray-100 rounded" />
        </div>
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 md:p-8">
          <div className="flex gap-2 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 flex-1 bg-gray-100 rounded-lg" />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-gray-50 border border-gray-100 p-6">
                <div className="h-6 w-48 bg-gray-200 rounded mb-3" />
                <div className="h-4 w-32 bg-gray-100 rounded mb-2" />
                <div className="h-4 w-24 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
