export function AdminPanel({
  children,
  className = "",
  id,
  title,
  actions,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  title?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm ring-1 ring-gray-950/[0.03] md:p-6 ${className}`}
    >
      {title || actions ? (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title ? <h2 className="text-sm font-semibold text-gray-900">{title}</h2> : <span />}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
