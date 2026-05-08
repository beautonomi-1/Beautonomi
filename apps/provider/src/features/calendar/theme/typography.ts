import { Colors } from "@/constants/colors";

export const CalendarTypography = {
  heroDate: { fontSize: 24, fontWeight: "700" as const, color: Colors.gray[900] },
  heroMeta: { fontSize: 14, fontWeight: "400" as const, color: Colors.gray[500] },
  heroValue: { fontSize: 20, fontWeight: "800" as const, color: Colors.gray[900] },
  cardTime: { fontSize: 14, fontWeight: "700" as const, color: Colors.gray[900] },
  cardName: { fontSize: 15, fontWeight: "600" as const, color: Colors.gray[900] },
  cardService: { fontSize: 13, fontWeight: "400" as const, color: Colors.gray[500] },
  pillLabel: { fontSize: 12, fontWeight: "600" as const },
  sectionHead: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: Colors.gray[400],
    letterSpacing: 0.8,
  },
};
