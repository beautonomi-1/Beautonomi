export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-gray-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">{actions}</div> : null}
    </div>
  );
}
