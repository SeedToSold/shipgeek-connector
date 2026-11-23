import type { ShipGeekContext } from "./auth.server";
import {
  collectResourceIds,
  requestsForeignResource,
  resourceIdList,
  scrubCustomerData,
  forwardableWebhookPayload,
  withoutUnownedResources,
  type ResourceIds,
} from "./customer-data";
import { adminGraphql } from "./graphql.server";
import { ConnectorError } from "./http";
import { isConnectorOrderMutation } from "./graphql-proxy";

type OwnerNode = {
  id?: string | null;
  app?: { id?: string | null } | null;
  order?: { id?: string | null; app?: { id?: string | null } | null } | null;
};

const appIds = new Map<string, string>();

export async function currentAppGid(admin: ShipGeekContext["admin"], shop: string) {
  const cached = appIds.get(shop);
  if (cached) return cached;
  const data = await adminGraphql<{ currentAppInstallation: { app: { id: string } } }>(
    admin,
    `#graphql
      query ConnectorCurrentApp {
        currentAppInstallation { app { id } }
      }
    `,
  );
  const id = data.currentAppInstallation?.app?.id || "";
  if (id) appIds.set(shop, id);
  return id;
}

export async function restrictGraphQLPayload(
  admin: ShipGeekContext["admin"],
  shop: string,
  payload: { data?: unknown; errors?: unknown; extensions?: unknown },
  variables: unknown,
  query: string,
) {
  const scrubbed = scrubCustomerData(payload);
  const explicit = collectResourceIds(variables, true);
  const present = collectResourceIds(scrubbed.data, false);
  const ids = uniqueIds(explicit, present);
  if (!ids.orders.length && !ids.fulfillments.length && !ids.fulfillmentOrders.length) return scrubbed;

  const owned = await resourceOwners(admin, shop, ids, createdOrderIds(query, scrubbed.data));
  if (requestsForeignResource(explicit, owned.foreign)) {
    throw new ConnectorError(403, "The connector can only access orders it created");
  }

  return { ...scrubbed, data: withoutUnownedResources(scrubbed.data, owned.owned, owned.foreign) };
}

export async function shipGeekWebhookPayload(
  admin: ShipGeekContext["admin"],
  shop: string,
  topic: string,
  payload: unknown,
) {
  const appGid = await currentAppGid(admin, shop);
  return forwardableWebhookPayload(topic, payload, appGid, (gid) => orderCreatedByConnector(admin, shop, gid));
}

async function orderCreatedByConnector(admin: ShipGeekContext["admin"], shop: string, gid: string) {
  const owned = await resourceOwners(admin, shop, { orders: [gid], fulfillments: [], fulfillmentOrders: [] }, new Set());
  return owned.owned.orders.has(gid);
}

async function resourceOwners(
  admin: ShipGeekContext["admin"],
  shop: string,
  ids: ResourceIds,
  createdIds: Set<string>,
) {
  const appGid = await currentAppGid(admin, shop);
  const requested = [...ids.orders, ...ids.fulfillments, ...ids.fulfillmentOrders];
  const data = await adminGraphql<{ nodes: Array<OwnerNode | null> }>(
    admin,
    `#graphql
      query ConnectorResourceOwners($ids: [ID!]!) {
        nodes(ids: $ids) {
          id
          ... on Order { app { id } }
          ... on Fulfillment { order { id app { id } } }
          ... on FulfillmentOrder { order { id app { id } } }
        }
      }
    `,
    { ids: requested },
  );

  const owned = { orders: new Set<string>(), fulfillments: new Set<string>(), fulfillmentOrders: new Set<string>() };
  const foreign = { orders: new Set<string>(), fulfillments: new Set<string>(), fulfillmentOrders: new Set<string>() };

  for (const node of data.nodes || []) {
    if (!node?.id) continue;
    const creator = node.app?.id || node.order?.app?.id || "";
    const orderId = node.order?.id || (ids.orders.includes(node.id) ? node.id : "");
    const allowed = creator === appGid || (createdIds.has(node.id) && !creator);
    if (orderId && allowed) owned.orders.add(orderId);
    if (allowed && ids.fulfillments.includes(node.id)) owned.fulfillments.add(node.id);
    if (allowed && ids.fulfillmentOrders.includes(node.id)) owned.fulfillmentOrders.add(node.id);
    if (!allowed && ids.orders.includes(node.id)) foreign.orders.add(node.id);
    if (!allowed && ids.fulfillments.includes(node.id)) foreign.fulfillments.add(node.id);
    if (!allowed && ids.fulfillmentOrders.includes(node.id)) foreign.fulfillmentOrders.add(node.id);
  }

  return { owned, foreign };
}

function createdOrderIds(query: string, data: unknown) {
  const ids = new Set<string>();
  if (!isConnectorOrderMutation(query) || !/\borderCreate\b/.test(query)) return ids;
  const orderId = data && typeof data === "object" ? (data as { orderCreate?: { order?: { id?: string } } }).orderCreate?.order?.id : "";
  if (orderId) ids.add(orderId);
  return ids;
}

function uniqueIds(left: ReturnType<typeof collectResourceIds>, right: ReturnType<typeof collectResourceIds>): ResourceIds {
  return resourceIdList({
    orders: new Set([...left.orders, ...right.orders]),
    fulfillments: new Set([...left.fulfillments, ...right.fulfillments]),
    fulfillmentOrders: new Set([...left.fulfillmentOrders, ...right.fulfillmentOrders]),
  });
}
