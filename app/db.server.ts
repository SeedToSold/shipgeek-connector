import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import migrationSql from "../prisma/postgres/migrations/20261120100000_init/migration.sql?raw";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

const MIGRATION_NAME = "20261120100000_init";

export async function ensureDatabase() {
  if (!/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL ?? "")) return;

  const found = await prisma.$queryRaw<Array<{ name: string | null }>>`
    SELECT to_regclass('public."Session"')::text AS name
  `;
  if (found[0]?.name) return;

  const sql = migrationSource();
  for (const statement of sqlStatements(sql)) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      if (statement.startsWith("CREATE SCHEMA") || alreadyExists(error)) continue;
      throw error;
    }
  }
  await recordMigration(sql);
}

function migrationSource() {
  const path = join(process.cwd(), "prisma/postgres/migrations", MIGRATION_NAME, "migration.sql");
  return existsSync(path) ? readFileSync(path, "utf8") : migrationSql;
}

function alreadyExists(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2010") return false;
  const databaseCode = typeof error.meta?.code === "string" ? error.meta.code : "";
  return databaseCode === "42P07" || databaseCode === "42710";
}

function sqlStatements(sql: string) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function recordMigration(sql: string) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMP(3),
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMP(3),
      "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);
  const applied = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT "migration_name" FROM "_prisma_migrations" WHERE "migration_name" = ${MIGRATION_NAME}
  `;
  if (applied.length > 0) return;
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "_prisma_migrations"
      ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
    VALUES
      (${randomUUID()}, ${createHash("sha256").update(sql).digest("hex")}, ${now}, ${MIGRATION_NAME}, ${now}, 1)
  `;
}

export default prisma;
