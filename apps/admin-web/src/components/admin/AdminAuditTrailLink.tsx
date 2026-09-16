import { Link } from "react-router";
import { FileText } from "lucide-react";
import { adminSpaTo } from "@/lib/adminSpaPath";

export function AdminAuditTrailLink({
  entityType,
  entityId,
  className = "",
  label = "View audit trail",
}: {
  entityType: string;
  entityId: string;
  className?: string;
  label?: string;
}) {
  const type = entityType.trim();
  const id = entityId.trim();
  if (!type || !id) return null;

  const params = new URLSearchParams({
    entity_type: type,
    entity_id: id,
  });

  return (
    <Link
      to={adminSpaTo(`/admin/audit-logs?${params.toString()}`)}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline ${className}`}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}
