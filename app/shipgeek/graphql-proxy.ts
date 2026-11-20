import { ConnectorError } from "./http";

const ORDER_FIELDS = /\b(orders|order|draftOrders|draftOrder|fulfillmentOrders|fulfillmentOrder|fulfillments|fulfillment)\b/;

export function queryText(document: string) {
  return String(document || "")
    .replace(/#graphql/g, " ")
    .replace(/#[^\n]*/g, " ")
    .replace(/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"/g, " ");
}

export function isOrderFulfillmentQuery(document: string) {
  const text = queryText(document);
  if (/\b(mutation|subscription)\b/.test(text)) return false;
  return ORDER_FIELDS.test(text);
}

export function assertOrderFulfillmentQuery(document: string) {
  if (!String(document || "").trim()) throw new ConnectorError(400, "Query is required");
  if (!isOrderFulfillmentQuery(document)) {
    throw new ConnectorError(403, "The connector only proxies order and fulfillment queries");
  }
}
