import { ConnectorError, isRecord } from "./http";
import { externalIdTag } from "./tokens";

const MONEY = /^\d+(\.\d{1,2})?$/;
const EXTERNAL_ID = /^[\w.:-]{1,128}$/;

export type AddressInput = {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  zip: string;
  countryCode: string;
  phone?: string;
};

export type CreateOrderInput = {
  externalId: string;
  name?: string;
  email?: string;
  note?: string;
  tags: string[];
  currency?: string;
  financialStatus: "PAID" | "PENDING";
  sendReceipt: boolean;
  customerId?: string;
  retailerOrderId?: string;
  sourceFulfillmentOrderId?: string;
  shippingAddress: AddressInput;
  billingAddress?: AddressInput;
  shippingLine?: { title: string; price: string };
  lineItems: Array<{
    variantId: string;
    quantity: number;
    title?: string;
    sku?: string;
    price?: string;
    sourceLineItemId?: string;
  }>;
};

export type PublicOrder = {
  id: string;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
  displayFulfillmentStatus: string | null;
  displayFinancialStatus: string | null;
  currencyCode: string | null;
  total: { amount: string; currencyCode: string } | null;
  tags: string[];
  note: string | null;
  externalId: string | null;
  retailerOrderId: string | null;
  sourceFulfillmentOrderId: string | null;
  lineItems: Array<{
    id: string;
    sku: string | null;
    name: string;
    quantity: number;
    variantId: string | null;
    variantSku: string | null;
    sourceLineItemId: string | null;
  }>;
  fulfillments: PublicFulfillment[];
};

export type PublicFulfillment = {
  id: string;
  displayStatus: string | null;
  createdAt: string | null;
  tracking: Array<{ company: string | null; number: string | null; url: string | null }>;
};

type OrderNode = {
  id?: string;
  name?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  displayFulfillmentStatus?: string | null;
  displayFinancialStatus?: string | null;
  currencyCode?: string | null;
  totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } } | null;
  tags?: string[];
  note?: string | null;
  externalId?: { value?: string | null } | null;
  retailerOrderId?: { value?: string | null } | null;
  sourceFulfillmentOrderId?: { value?: string | null } | null;
  lineItems?: {
    nodes?: Array<{
      id?: string;
      sku?: string | null;
      name?: string;
      quantity?: number;
      customAttributes?: Array<{ key?: string; value?: string }>;
      variant?: { id?: string; sku?: string | null } | null;
    }>;
  };
  fulfillments?: Array<{
    id?: string;
    displayStatus?: string | null;
    createdAt?: string | null;
    trackingInfo?: Array<{ company?: string | null; number?: string | null; url?: string | null }>;
  }>;
};

export function orderGid(id: string) {
  if (/^\d+$/.test(id)) return `gid://shopify/Order/${id}`;
  if (/^gid:\/\/shopify\/Order\/\d+$/.test(id)) return id;
  throw new ConnectorError(400, "Order id must be a Shopify order id");
}

export function toPublicOrder(node: OrderNode): PublicOrder {
  return {
    id: node.id || "",
    name: node.name || "",
    createdAt: node.createdAt || null,
    updatedAt: node.updatedAt || null,
    displayFulfillmentStatus: node.displayFulfillmentStatus || null,
    displayFinancialStatus: node.displayFinancialStatus || null,
    currencyCode: node.currencyCode || null,
    total: node.totalPriceSet?.shopMoney?.amount
      ? {
          amount: node.totalPriceSet.shopMoney.amount,
          currencyCode: node.totalPriceSet.shopMoney.currencyCode || "",
        }
      : null,
    tags: node.tags || [],
    note: node.note || null,
    externalId: node.externalId?.value || null,
    retailerOrderId: node.retailerOrderId?.value || null,
    sourceFulfillmentOrderId: node.sourceFulfillmentOrderId?.value || null,
    lineItems: (node.lineItems?.nodes || []).map((line) => ({
      id: line.id || "",
      sku: line.sku || null,
      name: line.name || "",
      quantity: line.quantity || 0,
      variantId: line.variant?.id || null,
      variantSku: line.variant?.sku || null,
      sourceLineItemId:
        line.customAttributes?.find((attribute) => attribute.key === "shipgeek_source_line_item_id")?.value || null,
    })),
    fulfillments: (node.fulfillments || []).map((fulfillment) => ({
      id: fulfillment.id || "",
      displayStatus: fulfillment.displayStatus || null,
      createdAt: fulfillment.createdAt || null,
      tracking: (fulfillment.trackingInfo || []).map((tracking) => ({
        company: tracking.company || null,
        number: tracking.number || null,
        url: tracking.url || null,
      })),
    })),
  };
}

export function toPublicTracking(node: OrderNode) {
  const order = toPublicOrder(node);
  return { orderId: order.id, name: order.name, fulfillments: order.fulfillments };
}

const FULFILLMENT_FILTERS = new Set(["unfulfilled", "partial", "fulfilled", "scheduled", "on_hold"]);

export function orderSearchQuery(url: URL) {
  const parts: string[] = [];
  const name = url.searchParams.get("name");
  if (name) {
    if (!/^#[A-Za-z0-9-]+$|^[A-Za-z0-9][\w-]{0,39}$/.test(name)) {
      throw new ConnectorError(400, "Order name filter is not valid");
    }
    parts.push(`name:${name}`);
  }
  const externalId = url.searchParams.get("externalId");
  if (externalId) {
    if (!EXTERNAL_ID.test(externalId)) {
      throw new ConnectorError(400, "externalId filter is not valid");
    }
    parts.push(`tag:${externalIdTag(externalId)}`);
  }
  const fulfillmentStatus = url.searchParams.get("fulfillmentStatus");
  if (fulfillmentStatus) {
    if (!FULFILLMENT_FILTERS.has(fulfillmentStatus)) {
      throw new ConnectorError(400, "fulfillmentStatus is not supported");
    }
    parts.push(`fulfillment_status:${fulfillmentStatus}`);
  }
  return parts.length ? parts.join(" AND ") : undefined;
}

export function parseCreateOrder(body: unknown): CreateOrderInput {
  if (!isRecord(body)) throw new ConnectorError(400, "Request body must be a JSON object");

  const externalId = stringField(body.externalId, "externalId");
  if (!EXTERNAL_ID.test(externalId)) {
    throw new ConnectorError(400, "externalId must be 1-128 letters, numbers, or . _ : -");
  }

  const lineItems = Array.isArray(body.lineItems) ? body.lineItems : null;
  if (!lineItems?.length || lineItems.length > 100) {
    throw new ConnectorError(400, "lineItems must contain 1 to 100 items");
  }

  const parsedLines = lineItems.map((item, index) => parseLine(item, index));
  const needsCurrency = parsedLines.some((line) => line.price) || isRecord(body.shippingLine);
  const currency = optionalString(body.currency, "currency");
  if (needsCurrency && !/^[A-Z]{3}$/.test(currency || "")) {
    throw new ConnectorError(400, "currency is required when a price is set");
  }

  const financialStatus = body.financialStatus === undefined ? "PAID" : body.financialStatus;
  if (financialStatus !== "PAID" && financialStatus !== "PENDING") {
    throw new ConnectorError(400, "financialStatus must be PAID or PENDING");
  }

  return {
    externalId,
    name: optionalString(body.name, "name", 64),
    email: parseEmail(body.email),
    note: optionalString(body.note, "note", 1000),
    tags: parseTags(body.tags),
    currency: currency || undefined,
    financialStatus,
    sendReceipt: body.sendReceipt === true,
    customerId: parseCustomerId(body.customerId),
    retailerOrderId: optionalId(body.retailerOrderId, "retailerOrderId"),
    sourceFulfillmentOrderId: optionalId(body.sourceFulfillmentOrderId, "sourceFulfillmentOrderId"),
    shippingAddress: parseAddress(body.shippingAddress, "shippingAddress", true),
    billingAddress: body.billingAddress === undefined ? undefined : parseAddress(body.billingAddress, "billingAddress", true),
    shippingLine: parseShippingLine(body.shippingLine),
    lineItems: parsedLines,
  };
}

export function buildOrderCreateVariables(input: CreateOrderInput) {
  const currency = input.currency;
  const tag = externalIdTag(input.externalId);
  const metafields = [
    metafield("external_id", input.externalId),
    input.retailerOrderId ? metafield("retailer_order_id", input.retailerOrderId) : null,
    input.sourceFulfillmentOrderId ? metafield("source_fulfillment_order_id", input.sourceFulfillmentOrderId) : null,
  ].filter((item) => item !== null);

  return {
    order: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      financialStatus: input.financialStatus,
      tags: [...input.tags, tag],
      shippingAddress: input.shippingAddress,
      ...(input.billingAddress ? { billingAddress: input.billingAddress } : {}),
      ...(input.customerId ? { customer: { toAssociate: { id: input.customerId } } } : {}),
      ...(input.shippingLine && currency
        ? {
            shippingLines: [
              {
                title: input.shippingLine.title,
                priceSet: { shopMoney: { amount: input.shippingLine.price, currencyCode: currency } },
              },
            ],
          }
        : {}),
      metafields,
      lineItems: input.lineItems.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        requiresShipping: true,
        ...(line.title ? { title: line.title } : {}),
        ...(line.sku ? { sku: line.sku } : {}),
        ...(line.price && currency
          ? { priceSet: { shopMoney: { amount: line.price, currencyCode: currency } } }
          : {}),
        ...(line.sourceLineItemId
          ? { properties: [{ name: "shipgeek_source_line_item_id", value: line.sourceLineItemId }] }
          : {}),
      })),
    },
    options: {
      inventoryBehaviour: "DECREMENT_OBEYING_POLICY",
      sendReceipt: input.sendReceipt,
      sendFulfillmentReceipt: false,
    },
  };
}

function metafield(key: string, value: string) {
  return { namespace: "shipgeek", key, type: "single_line_text_field", value };
}

function parseLine(value: unknown, index: number): CreateOrderInput["lineItems"][number] {
  if (!isRecord(value)) throw new ConnectorError(400, `lineItems[${index}] must be an object`);
  const quantity = value.quantity;
  if (!Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 10000) {
    throw new ConnectorError(400, `lineItems[${index}].quantity must be a positive integer`);
  }
  return {
    variantId: variantGid(stringField(value.variantId, `lineItems[${index}].variantId`)),
    quantity: Number(quantity),
    title: optionalString(value.title, `lineItems[${index}].title`, 255),
    sku: optionalString(value.sku, `lineItems[${index}].sku`, 255),
    price: parseMoney(value.price, `lineItems[${index}].price`),
    sourceLineItemId: optionalId(value.sourceLineItemId, `lineItems[${index}].sourceLineItemId`),
  };
}

function variantGid(id: string) {
  if (/^\d+$/.test(id)) return `gid://shopify/ProductVariant/${id}`;
  if (/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(id)) return id;
  throw new ConnectorError(400, "variantId must be a Shopify variant id");
}

function parseAddress(value: unknown, label: string, required: boolean): AddressInput {
  if (value === undefined || value === null) {
    if (required) throw new ConnectorError(400, `${label} is required`);
    throw new ConnectorError(400, `${label} is required`);
  }
  if (!isRecord(value)) throw new ConnectorError(400, `${label} must be an object`);
  const countryCode = stringField(value.countryCode, `${label}.countryCode`).toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new ConnectorError(400, `${label}.countryCode must be a 2-letter country code`);
  }
  return {
    firstName: bounded(stringField(value.firstName, `${label}.firstName`), `${label}.firstName`, 100),
    lastName: bounded(stringField(value.lastName, `${label}.lastName`), `${label}.lastName`, 100),
    company: optionalString(value.company, `${label}.company`, 255),
    address1: bounded(stringField(value.address1, `${label}.address1`), `${label}.address1`, 255),
    address2: optionalString(value.address2, `${label}.address2`, 255),
    city: bounded(stringField(value.city, `${label}.city`), `${label}.city`, 100),
    province: optionalString(value.province, `${label}.province`, 100),
    zip: bounded(stringField(value.zip, `${label}.zip`), `${label}.zip`, 20),
    countryCode,
    phone: optionalString(value.phone, `${label}.phone`, 30),
  };
}

function parseShippingLine(value: unknown) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ConnectorError(400, "shippingLine must be an object");
  const price = parseMoney(value.price, "shippingLine.price");
  if (!price) throw new ConnectorError(400, "shippingLine.price is required");
  const title = stringField(value.title, "shippingLine.title");
  return { title: bounded(title, "shippingLine.title", 255), price };
}

function parseTags(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) {
    throw new ConnectorError(400, "tags must be an array of up to 40 strings");
  }
  return value.map((tag, index) => {
    const text = stringField(tag, `tags[${index}]`).replaceAll(",", "");
    return bounded(text, `tags[${index}]`, 40);
  });
}

function parseEmail(value: unknown) {
  const email = optionalString(value, "email", 320);
  if (!email) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConnectorError(400, "email is not valid");
  return email;
}

function parseCustomerId(value: unknown) {
  const id = optionalString(value, "customerId", 128);
  if (!id) return undefined;
  if (/^\d+$/.test(id)) return `gid://shopify/Customer/${id}`;
  if (/^gid:\/\/shopify\/Customer\/\d+$/.test(id)) return id;
  throw new ConnectorError(400, "customerId must be a Shopify customer id");
}

function parseMoney(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const amount = stringField(value, label);
  if (!MONEY.test(amount)) throw new ConnectorError(400, `${label} must be a decimal amount`);
  return amount;
}

function optionalId(value: unknown, label: string) {
  const text = optionalString(value, label, 128);
  if (!text) return undefined;
  if (!/^[\w.:/-]{1,128}$/.test(text)) throw new ConnectorError(400, `${label} is not valid`);
  return text;
}

function optionalString(value: unknown, label: string, max = 255) {
  if (value === undefined || value === null || value === "") return undefined;
  return bounded(stringField(value, label), label, max);
}

function stringField(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConnectorError(400, `${label} is required`);
  }
  return value.trim();
}

function bounded(value: string, label: string, max: number) {
  if (value.length > max) throw new ConnectorError(400, `${label} is too long`);
  return value;
}
