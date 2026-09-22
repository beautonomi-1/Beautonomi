import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** Atomic JSON write (avoids Windows UNKNOWN on huge locale files). */
export function safeWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = JSON.stringify(data, null, 2) + "\n";
  const tmp = path.join(os.tmpdir(), `beautonomi-i18n-${path.basename(filePath)}-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, payload, "utf8");
  try {
    fs.renameSync(tmp, filePath);
  } catch (e) {
    fs.copyFileSync(tmp, filePath);
    fs.unlinkSync(tmp);
  }
}
