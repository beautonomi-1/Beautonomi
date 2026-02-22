import { Edit, Trash2 } from "lucide-react";

interface FooterLink {
  id: string;
  section: "about" | "business" | "legal" | "social" | "apps";
  title: string;
  href: string;
  display_order: number;
  is_external: boolean;
  is_active: boolean;
}

export function FooterLinkCard({
  link,
  onEdit,
  onDelete,
}: {
  link: FooterLink;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-lg">{link.title}</h3>
            <span className="text-sm text-gray-500">/</span>
            <span className="text-sm font-medium text-gray-700 capitalize">{link.section}</span>
          </div>
          <p className="text-sm text-gray-600 mb-2">
            <a href={link.href} target={link.is_external ? "_blank" : "_self"} rel={link.is_external ? "noopener noreferrer" : undefined} className="text-blue-600 hover:underline">
              {link.href}
            </a>
            {link.is_external && <span className="ml-2 text-xs text-gray-500">(External)</span>}
          </p>
        </div>
        <div className="flex gap-2 ml-4">
          <button
            onClick={onEdit}
            className="p-1 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-600 hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between pt-3 border-t">
        <span className="text-xs text-gray-600">Order: {link.display_order}</span>
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            link.is_active
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {link.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </div>
  );
}
