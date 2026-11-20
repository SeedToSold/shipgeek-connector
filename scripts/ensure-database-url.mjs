import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const path = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
const line = 'DATABASE_URL="file:./dev.sqlite"\n';

if (!existsSync(path)) {
  writeFileSync(path, line);
} else {
  const text = readFileSync(path, "utf8");
  if (!/^DATABASE_URL=/m.test(text)) {
    appendFileSync(path, `${text.endsWith("\n") || text.length === 0 ? "" : "\n"}${line}`);
  }
}
