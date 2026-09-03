import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";

export function SingularIntegrationPage() {
  useAdminDocumentTitle("Singular");
  const { denied } = useSuperadminPage("Superadmin access is required.");
  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Singular"
        description="Mobile attribution (customer + provider Expo apps). SDK init is ATT-gated. Apps URLs in platform settings should be Singular Links."
      />
      <AdminPanel>
        <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">
          <li>
            SDK: <code>apps/customer/src/lib/singular.ts</code> and the provider mirror. Custom user id is set on login
            and cleared on logout.
          </li>
          <li>
            SKAdNetwork: both Expo <code>app.config.js</code> files include Singular&apos;s{" "}
            <code>22mmun2rn5.skadnetwork</code> plus the partner IDs Singular publishes.
          </li>
          <li>Server revenue: booking / subscription / ads / IAP money events also send Singular S2S revenue when configured.</li>
          <li>Dashboard: confirm iOS SKAN and Android install referrer in the Singular workspace (not stored in this repo).</li>
        </ul>
      </AdminPanel>
    </div>
  );
}
