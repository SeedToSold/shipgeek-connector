import prisma from "../db.server";
import { ConnectorError } from "./http";
import { hashToken } from "./tokens";
import { unauthenticated } from "../shopify.server";

export type ShipGeekContext = {
  shop: string;
  tokenId: string;
  admin: Awaited<ReturnType<typeof unauthenticated.admin>>["admin"];
};

export async function requireShipGeekAuth(request: Request): Promise<ShipGeekContext> {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) throw new ConnectorError(401, "Missing bearer token");

  const record = await prisma.accessToken.findUnique({ where: { tokenHash: hashToken(match[1]) } });
  if (!record || record.revokedAt) throw new ConnectorError(401, "Invalid token");

  let admin: ShipGeekContext["admin"];
  try {
    ({ admin } = await unauthenticated.admin(record.shop));
  } catch (error) {
    console.error(`No Shopify session for ${record.shop}`, error instanceof Error ? error.message : "unknown error");
    throw new ConnectorError(409, "This shop has not finished installing the connector");
  }

  await prisma.accessToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return { shop: record.shop, tokenId: record.id, admin };
}

export async function recordAudit(input: {
  shop: string;
  tokenId?: string;
  action: string;
  status: number;
  resourceId?: string | null;
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        shop: input.shop,
        tokenId: input.tokenId,
        action: input.action,
        status: input.status,
        resourceId: input.resourceId || null,
      },
    });
  } catch (error) {
    console.error("Failed to write connector audit event", error instanceof Error ? error.message : "unknown error");
  }
}
