import { Copy } from "lucide-react";
import { adminToast } from "@/lib/adminToast";

export function BrandCopyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex flex-wrap items-start gap-2 text-sm">
      <span className="shrink-0 text-zinc-500">{label}:</span>
      <span className="min-w-0 flex-1 break-all font-mono text-xs text-zinc-800">{value}</span>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-violet-700 hover:bg-violet-50"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(
            () => adminToast.success("Copied"),
            () => adminToast.error("Could not copy"),
          );
        }}
      >
        <Copy className="h-3.5 w-3.5" aria-hidden />
        Copy
      </button>
    </li>
  );
}
