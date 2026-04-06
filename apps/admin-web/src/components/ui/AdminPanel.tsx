export function AdminPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm ring-1 ring-gray-950/[0.03] md:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
