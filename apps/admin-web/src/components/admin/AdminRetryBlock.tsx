/** Inline error + retry — pair with `AdminPanel` per UI conventions §8. */
export function AdminRetryBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <>
      <p className="text-sm text-red-800" role="alert">
        {message}
      </p>
      <button
        type="button"
        className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        onClick={() => onRetry()}
      >
        Retry
      </button>
    </>
  );
}
