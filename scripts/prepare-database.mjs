import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const prismaCli = new URL("../node_modules/prisma/build/index.js", import.meta.url);
const generateOnly = process.argv.includes("--generate-only");

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = new URL("../.env", import.meta.url);
  if (!existsSync(envPath)) return "";
  const line = readFileSync(envPath, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) return "";
  return line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
}

function run(args) {
  execFileSync(process.execPath, [prismaCli.pathname, ...args], { stdio: "inherit" });
}

const url = databaseUrl();
const postgres = /^postgres(?:ql)?:/i.test(url);

if (postgres) {
  execFileSync(process.execPath, [new URL("./postgres-schema.mjs", import.meta.url).pathname], { stdio: "inherit" });
  run(["migrate", "deploy", "--schema", "prisma/postgres/schema.prisma"]);
  run(["generate", "--schema", "prisma/postgres/schema.prisma"]);
} else if (generateOnly || !url.startsWith("file:")) {
  run(["generate"]);
} else {
  run(["migrate", "deploy"]);
  run(["generate"]);
}
