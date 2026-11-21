import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const sourcePath = new URL("../prisma/schema.prisma", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const provider = 'provider = "sqlite"';
if (!source.includes(provider)) {
  throw new Error(`${sourcePath.pathname} must keep ${provider} for local development`);
}

const schema = `// Generated from prisma/schema.prisma. Edit that file, then run this script.
${source.replace(provider, 'provider = "postgresql"')}`;
mkdirSync(new URL("../prisma/postgres", import.meta.url), { recursive: true });
writeFileSync(new URL("../prisma/postgres/schema.prisma", import.meta.url), schema);
