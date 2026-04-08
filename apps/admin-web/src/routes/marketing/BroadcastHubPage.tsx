import { Link } from "react-router-dom";
import { Megaphone, History } from "lucide-react";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { adminSpaTo } from "@/lib/adminSpaPath";

export function BroadcastHubPage() {
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  if (denied) return denied;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Broadcast"
        description="Compose campaigns in the SPA and review delivery history."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to={adminSpaTo("/admin/broadcast/compose")}
          className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-200/90 bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 p-6 text-white shadow-lg ring-1 ring-white/10 transition hover:shadow-xl hover:ring-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <div>
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Megaphone className="h-6 w-6" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">Compose campaign</h2>
            <p className="mt-2 max-w-sm text-sm text-violet-100">
              Send push, SMS, or email broadcasts using the admin broadcast APIs.
            </p>
          </div>
          <span className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-white/95">
            Open composer →
          </span>
        </Link>

        <Link
          to={adminSpaTo("/admin/broadcast/history")}
          className="group flex flex-col justify-between rounded-2xl border border-gray-200/90 bg-white p-6 shadow-sm ring-1 ring-gray-950/[0.04] transition hover:border-gray-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        >
          <div>
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-700 ring-1 ring-gray-200">
              <History className="h-6 w-6" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">Delivery history</h2>
            <p className="mt-2 text-sm text-gray-600">
              Paginated log of past broadcasts from <code className="rounded bg-gray-100 px-1 text-xs">GET /api/admin/broadcast/history</code>
              .
            </p>
          </div>
          <span className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-gray-900 group-hover:underline">
            View history →
          </span>
        </Link>
      </div>
    </div>
  );
}
