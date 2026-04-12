export default function PersonalInfoLoading() {
  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 md:py-8">
      <div className="w-full max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="h-5 w-24 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="bg-white rounded-2xl shadow-sm border p-6 md:p-8">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6" />
          <div className="space-y-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div className="h-3 w-20 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="h-10 w-full bg-gray-100 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
