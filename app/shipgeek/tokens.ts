import { createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "sgc_";

export function createAccessToken() {
  const secret = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    tokenHash: hashToken(secret),
    tokenPrefix: secret.slice(0, 12),
    lastFour: secret.slice(-4),
  };
}

export function hashToken(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function externalIdTag(externalId: string) {
  const hash = createHash("sha256").update(externalId).digest("hex").slice(0, 24);
  return `shipgeek-ref-${hash}`;
}
