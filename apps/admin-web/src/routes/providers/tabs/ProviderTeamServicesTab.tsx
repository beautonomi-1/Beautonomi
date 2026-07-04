import { AdminPanel } from "@/components/ui/AdminPanel";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { str } from "./types";

type Props = {
  staff: unknown[] | null | undefined;
  offerings: unknown[] | null | undefined;
};

const cur = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 2,
}).format;

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

export function ProviderTeamServicesTab({ staff, offerings }: Props) {
  const staffRows = Array.isArray(staff) ? staff.map(asRecord) : [];
  const offeringRows = Array.isArray(offerings) ? offerings.map(asRecord) : [];

  return (
    <div className="space-y-6">
      {/* ── Staff ────────────────────────────────────────────────── */}
      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Staff ({staffRows.length})</h2>
        <p className="mt-1 text-sm text-gray-600">
          Staff members linked to this provider, as returned by the provider detail endpoint.
        </p>

        {staffRows.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No staff members on file.</p>
        ) : (
          <AdminDataTable className="mt-4">
            <AdminTableHead>
              <tr>
                <AdminTh>Name</AdminTh>
                <AdminTh>Role</AdminTh>
                <AdminTh>Email</AdminTh>
                <AdminTh>Phone</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Joined</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {staffRows.map((s) => (
                <tr key={str(s.id)} className="hover:bg-gray-50/60">
                  <AdminTd className="font-medium">
                    {str(s.full_name) || str(s.display_name) || str(s.first_name) || "—"}
                  </AdminTd>
                  <AdminTd className="text-xs capitalize">{str(s.role) || "—"}</AdminTd>
                  <AdminTd className="font-mono text-xs">{str(s.email) || "—"}</AdminTd>
                  <AdminTd className="text-xs">{str(s.phone) || "—"}</AdminTd>
                  <AdminTd>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.is_active === false
                        ? "bg-gray-100 text-gray-600"
                        : "bg-green-100 text-green-800"
                    }`}>
                      {s.is_active === false ? "Inactive" : "Active"}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-500">
                    {s.created_at ? new Date(String(s.created_at)).toLocaleDateString() : "—"}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      {/* ── Services / offerings ─────────────────────────────────── */}
      <AdminPanel>
        <h2 className="text-base font-semibold text-gray-900">Services / offerings ({offeringRows.length})</h2>
        <p className="mt-1 text-sm text-gray-600">
          Bookable services listed by this provider.
        </p>

        {offeringRows.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No services listed.</p>
        ) : (
          <AdminDataTable className="mt-4">
            <AdminTableHead>
              <tr>
                <AdminTh>Name</AdminTh>
                <AdminTh>Category</AdminTh>
                <AdminTh>Duration</AdminTh>
                <AdminTh>Price</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Created</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {offeringRows.map((o) => (
                <tr key={str(o.id)} className="hover:bg-gray-50/60">
                  <AdminTd className="font-medium">{str(o.name) || "—"}</AdminTd>
                  <AdminTd className="text-xs capitalize text-gray-600">{str(o.category) || str(o.category_name) || "—"}</AdminTd>
                  <AdminTd className="text-xs text-gray-600">
                    {o.duration_minutes != null ? `${str(o.duration_minutes)} min` : "—"}
                  </AdminTd>
                  <AdminTd className="tabular-nums text-sm font-medium">
                    {o.price != null ? cur(Number(o.price)) : "—"}
                  </AdminTd>
                  <AdminTd>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      o.is_active === false
                        ? "bg-gray-100 text-gray-600"
                        : "bg-green-100 text-green-800"
                    }`}>
                      {o.is_active === false ? "Inactive" : "Active"}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-xs text-gray-500">
                    {o.created_at ? new Date(String(o.created_at)).toLocaleDateString() : "—"}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}
