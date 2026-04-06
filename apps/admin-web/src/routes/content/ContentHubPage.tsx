import { Link } from "react-router-dom";
import { BookOpen, Compass, Layers, ArrowUpRight } from "lucide-react";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

const CARDS: {
  to: string;
  label: string;
  description: string;
  icon: typeof BookOpen;
  accent: string;
}[] = [
  {
    to: "/content/learning",
    label: "Learning articles",
    description: "Curriculum list from the learning API — open legacy to edit.",
    icon: BookOpen,
    accent: "from-emerald-600 to-teal-700",
  },
  {
    to: "/explore",
    label: "Explore posts",
    description: "Moderation-friendly grid of explore posts for your tenant.",
    icon: Compass,
    accent: "from-sky-600 to-blue-800",
  },
  {
    to: "/catalog",
    label: "Catalog services",
    description: "Master services with category names; CRUD stays in legacy.",
    icon: Layers,
    accent: "from-amber-600 to-orange-800",
  },
];

export function ContentHubPage() {
  const { denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  if (denied) return denied;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Content"
        description="Read-only SPA entry points into the catalog and learning stack. Rich authoring remains in legacy until those flows migrate."
      />

      <a
        href={legacyAdminHref("/admin/content")}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] transition hover:border-gray-300 hover:bg-gray-50"
      >
        Open full legacy content hub
        <ArrowUpRight className="h-4 w-4 opacity-70" aria-hidden />
      </a>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-950/[0.04] transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
          >
            <div className={`bg-gradient-to-br px-5 py-4 text-white ${c.accent}`}>
              <c.icon className="h-8 w-8 opacity-90" aria-hidden />
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h2 className="text-lg font-semibold text-gray-900">{c.label}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{c.description}</p>
              <span className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-gray-900 group-hover:underline">
                Open in SPA →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
