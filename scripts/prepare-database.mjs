import { execFileSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
const postgres = /^postgres(?:ql)?:/i.test(url);
const generateOnly = process.argv.includes("--generate-only");
const prismaCli = new URL("../node_modules/prisma/build/index.js", import.meta.url);

function run(args) {
  execFileSync(process.execPath, [prismaCli.pathname, ...args], { stdio: "inherit" });
}

if (postgres) {
  execFileSync(process.execPath, [new URL("./postgres-schema.mjs", import.meta.url).pathname], { stdio: "inherit" });
  if (!generateOnly) run(["migrate", "deploy", "--schema", "prisma/postgres/schema.prisma"]);
  run(["generate", "--schema", "prisma/postgres/schema.prisma"]);
} else {
  if (!generateOnly) run(["migrate", "deploy"]);
  run(["generate"]);
}
