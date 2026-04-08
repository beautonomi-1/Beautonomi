/** First failed mutation message — place at bottom of forms / detail pages. */
export function AdminMutationAlert({ errors }: { errors: readonly (Error | null | undefined)[] }) {
  const err = errors.find((e): e is Error => e != null);
  if (!err) return null;
  return (
    <p className="text-sm text-red-700" role="alert">
      {err.message}
    </p>
  );
}
