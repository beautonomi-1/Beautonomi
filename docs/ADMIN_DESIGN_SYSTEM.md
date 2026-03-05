# Admin design system

Conventions for the Superadmin Portal (`/admin/*`) to keep UX consistent and maintainable.

## Components

- **UI primitives:** Use `@/components/ui/*` (Button, Input, Badge, Dialog, Select, Tabs, etc.). Prefer these over raw HTML.
- **Buttons:** Use `<Button>` from `@/components/ui/button`. All admin pages under `/admin` have been migrated; avoid introducing raw `<button>`.
  - Primary actions: `variant="secondary"` (brand gradient) or default.
  - Secondary/cancel: `variant="outline"`.
  - Tertiary/ghost: `variant="ghost"` (e.g. icon buttons, row actions).
  - Destructive: `variant="destructive"` or explicit danger styling.
- **Admin layout:** `AdminShell` provides sidebar, header, and mobile nav. Page content lives in the main area with `container mx-auto px-4 py-8` or `space-y-6` as needed.
- **Reusable admin blocks:** `@/components/admin/AdminPageHeader`, `AdminFilterBar` for consistent page title + description + actions and filter bars.

## Page structure

1. **Guard:** Wrap with `<RoleGuard allowedRoles={["superadmin"]} redirectTo="/">`.
2. **Loading:** Use `<LoadingTimeout loadingMessage="…" />` when `isLoading`.
3. **Error:** Use `<EmptyState title="…" description={error} action={{ label: "Retry", onClick }} />` when `error`.
4. **Success:** Page header (title + optional description + actions), then filters (if any), then main content (table, cards, etc.).

## Page header

- **Title:** `h1` with `text-3xl font-bold text-gray-900`.
- **Description (optional):** `p` with `text-gray-600 mt-1`.
- **Actions (optional):** Right-aligned (e.g. "Export", "Add"). Use `flex items-center justify-between` on the header row.
- Use `<AdminPageHeader title="…" description="…" actions={…} />` for consistency.

## Filter bar

- One row (or wrapped on small screens): search input, then status/role/date selects, then optional "Clear" or "Apply".
- Container: `bg-white p-4 rounded-lg border border-gray-200`.
- Search: icon (e.g. `Search`) left inside input, `pl-10` on `Input`.
- Selects: Prefer `<Select>` from `@/components/ui/select` over raw `<select>` for consistency. Options: "All …", then specific values.
- Use `<AdminFilterBar>` when you have a standard search + select(s) layout.

## Tables and lists

- Tables: Use semantic `<table>` or a card-based list. For row actions (view, edit, dropdown), use `Button variant="ghost" size="icon"` or `DropdownMenu` with `DropdownMenuTrigger asChild` + `Button variant="ghost"`.
- Empty state: `<EmptyState title="…" description="…" />` when the list is empty after loading.
- Toasts: Use `toast.success()` / `toast.error()` from `sonner` for action feedback.

## Dialogs and modals

- Use `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` from `@/components/ui/dialog`.
- Footer actions: Primary button (e.g. "Save") on the right, "Cancel" with `variant="outline"` on the left.

## Pages using shared components

- **AdminPageHeader and/or AdminFilterBar:** Refunds, Disputes, Payouts, Support Tickets, Gift Cards, Audit Logs, Custom Fields.
- **RoleGuard:** All admin pages use `redirectTo="/"` or `redirectTo="/admin/dashboard"` explicitly.

## Consistency checklist

- [ ] All interactive elements use `Button` or `Select`/`Input` from UI library.
- [ ] Loading and error states use `LoadingTimeout` and `EmptyState`.
- [ ] Page has a clear title (and optional description) at the top.
- [ ] Filters (if any) live in a single bar with consistent styling.
- [ ] Success/error feedback via `toast` after mutations.
