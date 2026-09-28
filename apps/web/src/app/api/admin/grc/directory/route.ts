import { grcGetHandler } from "@/lib/grc/http";
import { loadGrcDirectory } from "@/lib/grc/directory";

export const GET = grcGetHandler("grc.overview.view", async () => ({ users: await loadGrcDirectory() }));
