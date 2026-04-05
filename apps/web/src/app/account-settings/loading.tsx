export default function AccountSettingsLoading() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]" aria-busy="true">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
    </div>
  );
}
