export default function LoyaltyLoading() {
  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 md:py-8">
      <div className="w-full max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="h-5 w-24 bg-gray-200 rounded mb-4" />
        <div className="bg-white rounded-2xl shadow-sm border p-6 md:p-8 mb-6">
          <div className="h-8 w-40 bg-gray-200 rounded mb-3" />
          <div className="h-16 w-full bg-gradient-to-r from-gray-100 to-gray-50 rounded-xl mb-4" />
          <div className="h-4 w-56 bg-gray-100 rounded" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="h-6 w-36 bg-gray-200 rounded mb-4" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-50 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
