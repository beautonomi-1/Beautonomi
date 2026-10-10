import fs from "fs";

const p = "apps/provider/app/(app)/(tabs)/more/bookings/index.tsx";
let s = fs.readFileSync(p, "utf8");

const startMarker = '{viewMode === "day" ? (\r\n              <TouchableOpacity\r\n                onPress={() => {\r\n                  Alert.alert(';
const altStart = startMarker.replace(/\r\n/g, "\n");
let start = s.indexOf(altStart);
if (start < 0) start = s.indexOf(startMarker);
if (start < 0) {
  console.error("start not found");
  process.exit(1);
}

const endMarker = ") : null}\n            {(navCounts?.stale_pending_bookings";
const end = s.indexOf(endMarker, start);
if (end < 0) {
  console.error("end not found");
  process.exit(1);
}

const replacement = `{showRunningBehindBanner ? (
              <TouchableOpacity
                onPress={() => setShowRunningBehindSheet(true)}
                activeOpacity={0.85}
                style={[
                  twStyle("mx-4 mb-2 flex-row items-center rounded-xl border px-3 py-3"),
                  { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
                ]}
                accessibilityRole="button"
                accessibilityLabel={bl("runningBehindA11y")}
              >
                <Ionicons name="time-outline" size={18} color="#c2410c" style={{ marginEnd: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={twStyle("text-sm font-semibold text-orange-900")}>{bl("runningBehindBannerTitle")}</Text>
                  <Text style={twStyle("mt-0.5 text-xs text-orange-800")}>
                    {bl("runningBehindBannerBody")}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
            {(navCounts?.stale_pending_bookings`;

s = s.slice(0, start) + replacement + s.slice(end + endMarker.length);
fs.writeFileSync(p, s);
console.log("ok");
