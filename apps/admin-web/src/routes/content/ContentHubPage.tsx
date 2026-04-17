import { Link } from "react-router-dom";
import { BookOpen, Compass, FolderOpen, Globe2, Layers, HelpCircle, Info, FileText, MapPin, Link2 } from "lucide-react";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@beautonomi/admin-access";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { adminSpaTo } from "@/lib/adminSpaPath";

const CARDS: {
  to: string;
  label: string;
  description: string;
  icon: typeof BookOpen;
  accent: string;
}[] = [
  {
    to: adminSpaTo("/admin/content/learning"),
    label: "Learning articles",
    description: "Curriculum list from the learning API.",
    icon: BookOpen,
    accent: "from-emerald-600 to-teal-700",
  },
  {
    to: adminSpaTo("/admin/explore"),
    label: "Explore posts",
    description: "Feed moderation: filters, previews, bulk hide, per-post detail with comments and metrics.",
    icon: Compass,
    accent: "from-sky-600 to-blue-800",
  },
  {
    to: adminSpaTo("/admin/content/resources"),
    label: "CMS resources",
    description: "Tenant learning resources and guides (list view).",
    icon: FolderOpen,
    accent: "from-violet-600 to-fuchsia-800",
  },
  {
    to: adminSpaTo("/admin/catalog"),
    label: "Catalog services",
    description: "Master services with category names.",
    icon: Layers,
    accent: "from-amber-600 to-orange-800",
  },
  {
    to: adminSpaTo("/admin/catalog/global-categories"),
    label: "Global categories",
    description: "Platform service categories for onboarding and targeting.",
    icon: Globe2,
    accent: "from-amber-700 to-rose-800",
  },
  {
    to: adminSpaTo("/admin/content/faqs"),
    label: "FAQs",
    description: "Frequently asked questions for the customer app.",
    icon: HelpCircle,
    accent: "from-cyan-600 to-blue-700",
  },
  {
    to: adminSpaTo("/admin/content/about-us"),
    label: "About Us",
    description: "About Us page sections (mission, vision, team).",
    icon: Info,
    accent: "from-pink-600 to-rose-800",
  },
  {
    to: adminSpaTo("/admin/content/pages"),
    label: "CMS Pages",
    description: "Static content pages such as Terms, Privacy, etc.",
    icon: FileText,
    accent: "from-indigo-600 to-violet-800",
  },
  {
    to: adminSpaTo("/admin/content/featured-cities"),
    label: "Featured Cities",
    description: "Cities highlighted on the customer landing pages.",
    icon: MapPin,
    accent: "from-teal-600 to-emerald-800",
  },
  {
    to: adminSpaTo("/admin/content/app-links"),
    label: "App Links",
    description: "Download links for iOS, Android, and web apps.",
    icon: Link2,
    accent: "from-orange-600 to-red-800",
  },
];

export function ContentHubPage() {
  const { denied } = useAdminSectionPage(ADMIN_SECTION_CONTENT_CATALOG, "Content & catalog access is required.");
  if (denied) return denied;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Content"
        description="Learning, explore, and catalog tools in the admin app."
      />

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
                Open →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
