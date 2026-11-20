import { querySelectsCustomerData } from "./customer-data";
import { ConnectorError } from "./http";

const ORDER_FIELDS = /\b(orders|order|draftOrderAvailableDeliveryOptions|draftOrders|draftOrder|fulfillmentOrders|fulfillmentOrder|fulfillments|fulfillment)\b/;
const ORDER_MUTATIONS = /\b(orderCreate|orderCreateManualPayment)\b/;
const METAFIELD_MUTATIONS = /\b(metafieldDefinitionCreate|metafieldDefinitionUpdate)\b/;

export function queryText(document: string) {
  return String(document || "")
    .replace(/#graphql/g, " ")
    .replace(/#[^\n]*/g, " ")
    .replace(/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"/g, " ");
}

export function isConnectorOrderMutation(document: string) {
  const text = queryText(document);
  return /\bmutation\b/.test(text) && ORDER_MUTATIONS.test(text);
}

export function isShipGeekOrderMetafieldMutation(document: string) {
  const text = queryText(document);
  return /\bmutation\b/.test(text) && METAFIELD_MUTATIONS.test(text);
}

export function assertShipGeekOrderMetafield(variables: unknown) {
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    throw new ConnectorError(400, "Metafield definition is required");
  }
  const definition = (variables as { definition?: unknown }).definition;
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new ConnectorError(400, "Metafield definition is required");
  }
  const record = definition as { namespace?: unknown; ownerType?: unknown };
  if (record.namespace !== "shipgeek" || record.ownerType !== "ORDER") {
    throw new ConnectorError(403, "The connector only manages ShipGeek order metafields");
  }
}

export function isOrderFulfillmentQuery(document: string) {
  const text = queryText(document);
  if (/\b(mutation|subscription)\b/.test(text)) return false;
  return ORDER_FIELDS.test(text);
}

export function assertOrderFulfillmentQuery(document: string) {
  if (!String(document || "").trim()) throw new ConnectorError(400, "Query is required");
  if (!isOrderFulfillmentQuery(document) && !isConnectorOrderMutation(document) && !isShipGeekOrderMetafieldMutation(document)) {
    throw new ConnectorError(403, "The connector only proxies order and fulfillment queries, order creation, and ShipGeek order metafields");
  }
}

export function assertNoCustomerData(document: string) {
  if (querySelectsCustomerData(document)) throw new ConnectorError(403, "The connector does not return customer data");
}
