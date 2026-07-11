import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";
import { ADMIN_SECTION_COMMERCIAL } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/ui/EmptyState";

type TerminalProduct = {
  id: string;
  name: string;
  vendor: string;
  model: string | null;
  description: string | null;
  upfront_price: number | null;
  monthly_price: number | null;
  rental_price: number | null;
  currency: string;
  accounting_model: string | null;
  stock_status: string;
  active: boolean;
  display_order: number;
  gl_revenue_account?: string | null;
  gl_cogs_account?: string | null;
  gl_inventory_account?: string | null;
  gl_rental_income_account?: string | null;
  tax_code?: string | null;
  fulfillment_type?: string | null;
  subscription_plan_eligible?: boolean;
  requires_integration_setup?: boolean;
  integration_vendor_slug?: string | null;
  product_code?: string | null;
};

type ProductForm = {
  name: string;
  vendor: string;
  model: string;
  description: string;
  currency: string;
  upfront_price: string;
  monthly_price: string;
  rental_price: string;
  accounting_model: string;
  stock_status: string;
  active: boolean;
  display_order: string;
  gl_revenue_account: string;
  gl_cogs_account: string;
  gl_inventory_account: string;
  gl_rental_income_account: string;
  tax_code: string;
  fulfillment_type: string;
  subscription_plan_eligible: boolean;
  requires_integration_setup: boolean;
  integration_vendor_slug: string;
  product_code: string;
};

const VENDORS = ["yoco", "ikhokha", "capitec", "fnb", "nedbank", "absa", "standard_bank", "beautonomi", "other"];
// Rental is intentionally not selectable: providers can only buy or include a terminal in
// their plan (Option C). The DB enum keeps "rental" for legacy products/accounting.
const ACCOUNTING_MODELS = ["once_off_purchase", "subscription_bundle", "lease_to_own", "promotional"];
const STOCK_STATUSES = ["in_stock", "low_stock", "out_of_stock", "discontinued", "coming_soon"];
const FULFILLMENT_TYPES = ["shipping", "courier", "collection", "digital_activation"];

const defaultForm = (): ProductForm => ({
  name: "",
  vendor: "yoco",
  model: "",
  description: "",
  currency: "ZAR",
  upfront_price: "",
  monthly_price: "",
  rental_price: "",
  accounting_model: "once_off_purchase",
  stock_status: "in_stock",
  active: true,
  display_order: "0",
  gl_revenue_account: "3200",
  gl_cogs_account: "4200",
  gl_inventory_account: "1200",
  gl_rental_income_account: "3210",
  tax_code: "",
  fulfillment_type: "courier",
  subscription_plan_eligible: false,
  requires_integration_setup: false,
  integration_vendor_slug: "",
  product_code: "",
});

function formFromProduct(p: TerminalProduct): ProductForm {
  return {
    name: p.name,
    vendor: p.vendor,
    model: p.model ?? "",
    description: p.description ?? "",
    currency: p.currency,
    upfront_price: p.upfront_price != null ? String(p.upfront_price) : "",
    monthly_price: p.monthly_price != null ? String(p.monthly_price) : "",
    rental_price: p.rental_price != null ? String(p.rental_price) : "",
    accounting_model: p.accounting_model ?? "once_off_purchase",
    stock_status: p.stock_status,
    active: p.active,
    display_order: String(p.display_order ?? 0),
    gl_revenue_account: p.gl_revenue_account ?? "3200",
    gl_cogs_account: p.gl_cogs_account ?? "4200",
    gl_inventory_account: p.gl_inventory_account ?? "1200",
    gl_rental_income_account: p.gl_rental_income_account ?? "3210",
    tax_code: p.tax_code ?? "",
    fulfillment_type: p.fulfillment_type ?? "courier",
    subscription_plan_eligible: p.subscription_plan_eligible === true,
    requires_integration_setup: p.requires_integration_setup === true,
    integration_vendor_slug: p.integration_vendor_slug ?? "",
    product_code: p.product_code ?? "",
  };
}

function formToPayload(form: ProductForm) {
  const parsePrice = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    name: form.name.trim(),
    vendor: form.vendor,
    model: form.model.trim() || null,
    description: form.description.trim() || null,
    currency: form.currency.trim().toUpperCase() || "ZAR",
    upfront_price: parsePrice(form.upfront_price),
    monthly_price: parsePrice(form.monthly_price),
    rental_price: parsePrice(form.rental_price),
    accounting_model: form.accounting_model || null,
    stock_status: form.stock_status,
    active: form.active,
    display_order: parseInt(form.display_order, 10) || 0,
    gl_revenue_account: form.gl_revenue_account.trim() || null,
    gl_cogs_account: form.gl_cogs_account.trim() || null,
    gl_inventory_account: form.gl_inventory_account.trim() || null,
    gl_rental_income_account: form.gl_rental_income_account.trim() || null,
    tax_code: form.tax_code.trim() || null,
    fulfillment_type: form.fulfillment_type || null,
    subscription_plan_eligible: form.subscription_plan_eligible,
    requires_integration_setup: form.requires_integration_setup,
    integration_vendor_slug: form.integration_vendor_slug.trim() || null,
    product_code: form.product_code.trim() || null,
  };
}

function ProductFormFields({
  form,
  setForm,
}: {
  form: ProductForm;
  setForm: React.Dispatch<React.SetStateAction<ProductForm>>;
}) {
  const inputClass = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
        <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Vendor</label>
        <select className={inputClass} value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}>
          {VENDORS.map((v) => (
            <option key={v} value={v}>{v.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
        <input className={inputClass} value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Upfront price</label>
        <input type="number" min="0" step="0.01" className={inputClass} value={form.upfront_price} onChange={(e) => setForm((f) => ({ ...f, upfront_price: e.target.value }))} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Monthly price</label>
        <input type="number" min="0" step="0.01" className={inputClass} value={form.monthly_price} onChange={(e) => setForm((f) => ({ ...f, monthly_price: e.target.value }))} />
      </div>
      {form.rental_price.trim() !== "" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Rental price (legacy)</label>
          <input type="number" className={`${inputClass} bg-gray-50 text-gray-500`} value={form.rental_price} readOnly disabled />
          <p className="mt-1 text-xs text-gray-400">Rental is no longer offered; value kept for legacy records.</p>
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Commercial model</label>
        <select className={inputClass} value={form.accounting_model} onChange={(e) => setForm((f) => ({ ...f, accounting_model: e.target.value }))}>
          {form.accounting_model === "rental" && (
            <option value="rental" disabled>rental (legacy — not selectable)</option>
          )}
          {ACCOUNTING_MODELS.map((m) => (
            <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Fulfillment type</label>
        <select className={inputClass} value={form.fulfillment_type} onChange={(e) => setForm((f) => ({ ...f, fulfillment_type: e.target.value }))}>
          {FULFILLMENT_TYPES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Product code</label>
        <input className={inputClass} value={form.product_code} onChange={(e) => setForm((f) => ({ ...f, product_code: e.target.value }))} placeholder="Matches subscription plan terminal_model" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Integration vendor slug</label>
        <input className={inputClass} value={form.integration_vendor_slug} onChange={(e) => setForm((f) => ({ ...f, integration_vendor_slug: e.target.value }))} placeholder="Defaults to vendor" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Display order</label>
        <input type="number" className={inputClass} value={form.display_order} onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))} />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
        <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
          Active in catalog
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.subscription_plan_eligible} onChange={(e) => setForm((f) => ({ ...f, subscription_plan_eligible: e.target.checked }))} />
          Subscription plan eligible
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.requires_integration_setup} onChange={(e) => setForm((f) => ({ ...f, requires_integration_setup: e.target.checked }))} />
          Requires integration setup
        </label>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Stock status</label>
        <select className={inputClass} value={form.stock_status} onChange={(e) => setForm((f) => ({ ...f, stock_status: e.target.value }))}>
          {STOCK_STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2 border-t border-gray-100 pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">GL accounts (752 defaults)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["gl_revenue_account", "Revenue"],
              ["gl_cogs_account", "COGS"],
              ["gl_inventory_account", "Inventory"],
              ["gl_rental_income_account", "Rental income"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
              <input
                className={inputClass}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder="GL code"
              />
            </div>
          ))}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tax code</label>
            <input className={inputClass} value={form.tax_code} onChange={(e) => setForm((f) => ({ ...f, tax_code: e.target.value }))} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TerminalProductsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  useAdminDocumentTitle("Terminal Products");
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<TerminalProduct | null>(null);
  const [form, setForm] = useState<ProductForm>(defaultForm);

  const { data, isLoading, isError, refetch } = useQuery<{ items: TerminalProduct[]; total: number }>({
    queryKey: adminQueryKeys.commercialTerminalProducts,
    queryFn: () => adminApi.getJson("/api/admin/commercial/terminal-products"),
    enabled: allowed,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = formToPayload(form);
      if (editProduct) {
        return adminApi.patchJson(`/api/admin/commercial/terminal-products/${editProduct.id}`, body);
      }
      return adminApi.postJson("/api/admin/commercial/terminal-products", body);
    },
    onSuccess: () => {
      adminToast.success(editProduct ? "Product updated" : "Product created");
      qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalProducts });
      setModalOpen(false);
      setEditProduct(null);
      setForm(defaultForm());
    },
    onError: (e: Error) => adminToast.error(e.message || "Failed to save product"),
  });

  function openCreate() {
    setEditProduct(null);
    setForm(defaultForm());
    setModalOpen(true);
  }

  function openEdit(p: TerminalProduct) {
    setEditProduct(p);
    setForm(formFromProduct(p));
    setModalOpen(true);
  }

  if (denied) return denied;
  if (isLoading) return <AdminPageSkeleton />;
  if (isError) return <AdminRetryBlock message="Failed to load terminal products" onRetry={() => refetch()} />;

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Terminal Products"
        description="Card machine and payment terminal catalog for provider e-commerce."
        actions={
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
            <Plus className="h-4 w-4" />
            Add product
          </button>
        }
      />

      <AdminPanel>
        {items.length === 0 ? (
          <EmptyState
            title="No terminal products yet"
            description="Add terminal products to enable provider e-commerce."
            action={
              <button type="button" onClick={openCreate} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
                Add product
              </button>
            }
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Product</AdminTh>
                <AdminTh>Vendor</AdminTh>
                <AdminTh>Upfront</AdminTh>
                <AdminTh>Monthly</AdminTh>
                <AdminTh>Rental</AdminTh>
                <AdminTh>Model</AdminTh>
                <AdminTh>Stock</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/60">
                  <AdminTd className="font-medium text-slate-900">{p.name}</AdminTd>
                  <AdminTd className="capitalize">{p.vendor}</AdminTd>
                  <AdminTd>{p.upfront_price != null ? `${p.currency} ${Number(p.upfront_price).toLocaleString()}` : "—"}</AdminTd>
                  <AdminTd>{p.monthly_price != null ? `${p.currency} ${Number(p.monthly_price).toLocaleString()}` : "—"}</AdminTd>
                  <AdminTd>{p.rental_price != null ? `${p.currency} ${Number(p.rental_price).toLocaleString()}` : "—"}</AdminTd>
                  <AdminTd>{p.model ?? "—"}</AdminTd>
                  <AdminTd className="capitalize">{p.stock_status.replace(/_/g, " ")}</AdminTd>
                  <AdminTd>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${p.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                      {p.active ? "Active" : "Inactive"}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <button type="button" onClick={() => openEdit(p)} className={adminToolbarButtonClass()} title="Edit product">
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      <AdminModal
        open={modalOpen}
        title={editProduct ? "Edit terminal product" : "Add terminal product"}
        onClose={() => { setModalOpen(false); setEditProduct(null); }}
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={saveMut.isPending || !form.name.trim()}
              onClick={() => saveMut.mutate()}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saveMut.isPending ? "Saving…" : editProduct ? "Save changes" : "Create product"}
            </button>
          </>
        }
      >
        <ProductFormFields form={form} setForm={setForm} />
      </AdminModal>
    </div>
  );
}
