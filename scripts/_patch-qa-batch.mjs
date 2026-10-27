import fs from "node:fs";

function patch(path, edits) {
  let s = fs.readFileSync(path, "utf8");
  for (const [oldStr, newStr] of edits) {
    if (!s.includes(oldStr)) {
      console.warn("MISSING in", path, oldStr.slice(0, 60));
      continue;
    }
    s = s.replace(oldStr, newStr);
  }
  fs.writeFileSync(path, s);
  console.log("patched", path);
}

patch(
  "c:/Users/NoloSehlolo/Documents/Beautonomi/apps/web/src/app/provider/settings/team/permissions/page.tsx",
  [
    [
      `  const [isSaving, setIsSaving] = useState(false);`,
      `  const [isSaving, setIsSaving] = useState(false);
  const [memberIsAdmin, setMemberIsAdmin] = useState(false);`,
    ],
    [
      `      setAttachedRoleId(response.data.role_id ?? null);
      setAttachedRoleName(response.data.role_name ?? null);`,
      `      setAttachedRoleId(response.data.role_id ?? null);
      setAttachedRoleName(response.data.role_name ?? null);
      try {
        const settingsRes = await fetcher.get<{ data?: { is_admin?: boolean } }>(
          \`/api/provider/staff/\${memberId}/settings\`,
        );
        setMemberIsAdmin(settingsRes.data?.is_admin === true);
      } catch {
        setMemberIsAdmin(false);
      }`,
    ],
    [
      `  const selectedMemberData = teamMembers.find((m) => m.id === selectedMember);`,
      `  const selectedMemberData = teamMembers.find((m) => m.id === selectedMember);
  const memberFullAccess =
    selectedMemberData?.role === "owner" || memberIsAdmin === true;
  const permissionsEditable = canManageTeam && !memberFullAccess;`,
    ],
    [
      `      onSave={canManageTeam ? handleSave : undefined}`,
      `      onSave={permissionsEditable ? handleSave : undefined}`,
    ],
    [
      `                  disabled={!selectedMember || !canManageTeam}`,
      `                  disabled={!selectedMember || !permissionsEditable}`,
    ],
    [
      `                            disabled={!canManageTeam}`,
      `                            disabled={!permissionsEditable}`,
    ],
    [
      `                        onClick={() => handleSelectAll(category)}
                        className="min-h-[36px] touch-manipulation"
                      >`,
      `                        onClick={() => handleSelectAll(category)}
                        disabled={!permissionsEditable}
                        className="min-h-[36px] touch-manipulation"
                      >`,
    ],
    [
      `          {selectedMember && (
            <div className="space-y-4 sm:space-y-6">`,
      `          {selectedMember && memberFullAccess && (
            <SectionCard className="p-4 bg-gray-50">
              <p className="text-sm text-gray-700">
                {t("web.provider.settings.pages.team/permissions.fullAccessMemberHint")}
              </p>
            </SectionCard>
          )}
          {selectedMember && (
            <div className="space-y-4 sm:space-y-6">`,
    ],
  ],
);

patch(
  "c:/Users/NoloSehlolo/Documents/Beautonomi/apps/web/src/app/provider/team/payroll/[id]/page.tsx",
  [
    [
      `<TableCell className="font-medium">{item.staff_name}</TableCell>`,
      `<TableCell className="font-medium">
                      <div>{item.staff_name}</div>
                      {Number(item.commission_clawback) !== 0 ? (
                        <p className="text-xs text-red-600 font-normal">
                          {t("web.provider.pages.team/payroll/[id].clawback")}: {fmt(Number(item.commission_clawback))}
                        </p>
                      ) : null}
                      {Number(item.carry_forward_in) !== 0 ? (
                        <p className="text-xs text-gray-600 font-normal">
                          {t("web.provider.pages.team/payroll/[id].carryForwardIn")}: {fmt(Number(item.carry_forward_in))}
                        </p>
                      ) : null}
                      {Number(item.carry_forward_out) !== 0 ? (
                        <p className="text-xs text-gray-600 font-normal">
                          {t("web.provider.pages.team/payroll/[id].carryForwardOut")}: {fmt(Number(item.carry_forward_out))}
                        </p>
                      ) : null}
                    </TableCell>`,
    ],
  ],
);
