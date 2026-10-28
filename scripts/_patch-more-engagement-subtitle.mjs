import fs from "node:fs";
const p = "c:/Users/NoloSehlolo/Documents/Beautonomi/apps/provider/app/(app)/(tabs)/more/index.tsx";
let s = fs.readFileSync(p, "utf8");
const old =
  'const itemSubtitle = item.subtitleKey ? t(item.subtitleKey) : (item.subtitle ?? "");';
const neu = `const itemSubtitle =
                      item.route.includes("engagement-hub") && !canManageMarketing
                        ? t("provider.mobile.screens.moreTab.engagementSubtitleNoMarketing")
                        : item.subtitleKey
                          ? t(item.subtitleKey)
                          : (item.subtitle ?? "");`;
if (!s.includes("engagementSubtitleNoMarketing")) {
  if (!s.includes(old)) throw new Error("old subtitle line not found");
  s = s.replace(old, neu);
  fs.writeFileSync(p, s);
  console.log("ok");
} else {
  console.log("already patched");
}
