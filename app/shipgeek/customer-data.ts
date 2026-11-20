const CUSTOMER_FIELDS = new Set([
  "email",
  "phone",
  "customer",
  "shippingAddress",
  "billingAddress",
  "displayAddress",
  "destination",
  "customerLocale",
  "purchasingEntity",
  "defaultAddress",
  "billingAddressMatchesShippingAddress",
  "customerAcceptsMarketing",
  "customerJourney",
  "customerJourneySummary",
  "localizedFields",
  "clientIp",
]);

const SCRUB_KEYS = new Set([
  ...CUSTOMER_FIELDS,
  "contact_email",
  "shipping_address",
  "billing_address",
  "customer_locale",
  "browser_ip",
  "client_details",
  "buyer_accepts_marketing",
]);

const ORDER_GID = /^gid:\/\/shopify\/Order\/\d+$/;
const FULFILLMENT_GID = /^gid:\/\/shopify\/Fulfillment\/\d+$/;
const FULFILLMENT_ORDER_GID = /^gid:\/\/shopify\/FulfillmentOrder\/\d+$/;

export type ResourceIds = {
  orders: string[];
  fulfillments: string[];
  fulfillmentOrders: string[];
};

type IdSets = {
  orders: Set<string>;
  fulfillments: Set<string>;
  fulfillmentOrders: Set<string>;
};

export function querySelectsCustomerData(document: string) {
  return omitCustomerSelections(document) !== String(document || "");
}

export function omitCustomerSelections(source: string) {
  const input = String(source || "");
  let result = "";
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (char === "#") {
      const end = input.indexOf("\n", index);
      const next = end === -1 ? input.length : end;
      result += input.slice(index, next);
      index = next;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = endOfString(input, index);
      result += input.slice(index, end);
      index = end;
      continue;
    }
    if (/[A-Za-z_]/.test(char || "")) {
      let end = index + 1;
      while (end < input.length && /[A-Za-z0-9_]/.test(input[end] || "")) end += 1;
      const ident = input.slice(index, end);
      if (CUSTOMER_FIELDS.has(ident)) {
        result = result.replace(/[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*:[ \t]*$/, "");
        index = skipField(input, end);
        continue;
      }
      result += ident;
      index = end;
      continue;
    }
    result += char;
    index += 1;
  }

  return result;
}

export function scrubCustomerData<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => scrubCustomerData(item)) as T;
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SCRUB_KEYS.has(key)) continue;
    next[key] = scrubCustomerData(child);
  }
  return next as T;
}

export function collectResourceIds(value: unknown, includeStrings: boolean, found: IdSets = emptyIds()) {
  if (typeof value === "string") {
    if (includeStrings) addGid(value, found);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectResourceIds(item, includeStrings, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") addGid(record.id, found);
  for (const child of Object.values(record)) collectResourceIds(child, includeStrings, found);
  return found;
}

export function resourceIdList(ids: IdSets): ResourceIds {
  return {
    orders: [...ids.orders],
    fulfillments: [...ids.fulfillments],
    fulfillmentOrders: [...ids.fulfillmentOrders],
  };
}

export function withoutUnownedResources(value: unknown, owned: IdSets, foreign: IdSets = emptyIds()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => withoutUnownedResources(item, owned, foreign)).filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  if (ORDER_GID.test(id) && !owned.orders.has(id)) return undefined;
  if (FULFILLMENT_GID.test(id) && foreign.fulfillments.has(id)) return undefined;
  if (FULFILLMENT_ORDER_GID.test(id) && foreign.fulfillmentOrders.has(id)) return undefined;

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    const cleaned = withoutUnownedResources(child, owned, foreign);
    if (cleaned !== undefined) next[key] = cleaned;
  }
  if ("node" in record && !("node" in next)) return undefined;
  return next;
}

export function requestsForeignResource(explicit: IdSets, foreign: IdSets) {
  return [...explicit.orders, ...explicit.fulfillments, ...explicit.fulfillmentOrders].some((id) =>
    foreign.orders.has(id) || foreign.fulfillments.has(id) || foreign.fulfillmentOrders.has(id),
  );
}

export function appIdNumeric(appGid: string) {
  return /^gid:\/\/shopify\/App\/(\d+)$/.exec(appGid)?.[1] || "";
}

export function webhookOrderCreatedByApp(payload: unknown, appGid: string) {
  if (!payload || typeof payload !== "object") return false;
  const appId = (payload as { app_id?: unknown }).app_id;
  const numeric = appIdNumeric(appGid);
  return Boolean(numeric) && String(appId) === numeric;
}

export function topicKind(topic: string) {
  const value = String(topic || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "/");
  if (value.startsWith("orders/")) return "order";
  if (value.startsWith("fulfillments/")) return "fulfillment";
  return "other";
}

function emptyIds(): IdSets {
  return { orders: new Set(), fulfillments: new Set(), fulfillmentOrders: new Set() };
}

function addGid(value: string, found: IdSets) {
  if (ORDER_GID.test(value)) found.orders.add(value);
  else if (FULFILLMENT_GID.test(value)) found.fulfillments.add(value);
  else if (FULFILLMENT_ORDER_GID.test(value)) found.fulfillmentOrders.add(value);
}

function skipField(input: string, index: number) {
  let cursor = index;
  while (cursor < input.length && /\s/.test(input[cursor] || "")) cursor += 1;
  if (input[cursor] === "(") cursor = skipBlock(input, cursor, "(", ")");
  while (cursor < input.length && /\s/.test(input[cursor] || "")) cursor += 1;
  if (input[cursor] === "{") cursor = skipBlock(input, cursor, "{", "}");
  return cursor;
}

function skipBlock(input: string, index: number, open: string, close: string) {
  let depth = 0;
  let quote = "";
  for (let cursor = index; cursor < input.length; cursor += 1) {
    const char = input[cursor] || "";
    if (quote) {
      if (char === "\\") {
        cursor += 1;
        continue;
      }
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#") {
      const end = input.indexOf("\n", cursor);
      cursor = end === -1 ? input.length : end;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
  }
  return input.length;
}

function endOfString(input: string, index: number) {
  const quote = input[index];
  for (let cursor = index + 1; cursor < input.length; cursor += 1) {
    if (input[cursor] === "\\") {
      cursor += 1;
      continue;
    }
    if (input[cursor] === quote) return cursor + 1;
  }
  return input.length;
}
