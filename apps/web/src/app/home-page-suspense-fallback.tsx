/**
 * Lightweight placeholder under header + h1 while `useSearchParams()` stream resolves.
 * Matches section spacing so layout does not jump.
 */
export default function HomePageSuspenseFallback() {
  return (
    <div className="pt-4 md:pt-6 w-full max-w-full overflow-x-hidden">
      <div className="max-w-[2340px] mx-auto px-4 md:px-8 lg:px-20 mb-8 md:mb-12">
        <div className="h-8 w-48 bg-gray-100 rounded-md animate-pulse mb-6" />
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex-shrink-0 w-[calc(85vw)] md:w-1/4 h-64 bg-gray-100 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
