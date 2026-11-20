import { createHmac } from "node:crypto";
import { ConnectorError } from "./http";

export const ORDER_WEBHOOKS = [
  { topic: "ORDERS_CREATE", metafieldNamespaces: ["shipgeek"] },
  { topic: "ORDERS_UPDATED", metafieldNamespaces: ["shipgeek"] },
  { topic: "ORDERS_CANCELLED" },
  { topic: "FULFILLMENTS_CREATE" },
  { topic: "FULFILLMENTS_UPDATE" },
] as const;

export const webhookCallbackUrl = (appUrl: string) => {
  const base = String(appUrl || "").trim();
  if (!base) throw new ConnectorError(409, "SHOPIFY_APP_URL is not set");
  return new URL("/webhooks/shopify", base.endsWith("/") ? base : `${base}/`).href;
};

export function signWebhook(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function destinationFromBody(body: unknown) {
  if (!body || typeof body !== "object") throw new ConnectorError(400, "Destination is required");
  const record = body as { url?: unknown; secret?: unknown };
  let url: URL;
  try {
    url = new URL(String(record.url || ""));
  } catch {
    throw new ConnectorError(400, "ShipGeek webhook URL is invalid");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new ConnectorError(400, "ShipGeek webhook URL must use HTTPS");
  }
  const secret = String(record.secret || "");
  if (secret.length < 16) throw new ConnectorError(400, "ShipGeek webhook secret is too short");
  return { url: url.href, secret };
}
