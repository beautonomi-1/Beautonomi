export function PermissionDenied({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
      <h2 className="text-lg font-semibold">Permission denied</h2>
      <p className="mt-2 text-sm">
        {message ??
          "You do not have access to this section. If you believe this is wrong, contact a superadmin."}
      </p>
    </div>
  );
}
