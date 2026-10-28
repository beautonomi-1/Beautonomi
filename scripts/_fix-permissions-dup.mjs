import fs from "node:fs";
const p =
  "c:/Users/NoloSehlolo/Documents/Beautonomi/apps/web/src/app/provider/settings/team/permissions/page.tsx";
let s = fs.readFileSync(p, "utf8");
s = s.replace(
  `  const [memberIsAdmin, setMemberIsAdmin] = useState(false);
  const [memberIsAdmin, setMemberIsAdmin] = useState(false);
`,
  `  const [memberIsAdmin, setMemberIsAdmin] = useState(false);
`,
);
const block = `      try {
        const settingsRes = await fetcher.get<{ data?: { is_admin?: boolean } }>(
          \`/api/provider/staff/\${memberId}/settings\`,
        );
        setMemberIsAdmin(settingsRes.data?.is_admin === true);
      } catch {
        setMemberIsAdmin(false);
      }
`;
while (s.includes(block + block)) {
  s = s.replace(block + block, block);
}
fs.writeFileSync(p, s);
console.log("fixed permissions dup");
