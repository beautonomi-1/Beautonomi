import { Link, useLocation } from "react-router";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminTabButtonClass } from "@/lib/adminUi";

export function TrustReportsTabNav() {
  const { pathname } = useLocation();
  const isContent = pathname.includes("content-reports");

  return (
    <div className="flex flex-wrap gap-2">
      <Link to={adminSpaTo("/admin/user-reports")} className={adminTabButtonClass(!isContent)}>
        User reports
      </Link>
      <Link to={adminSpaTo("/admin/content-reports")} className={adminTabButtonClass(isContent)}>
        Content reports
      </Link>
    </div>
  );
}
