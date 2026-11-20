import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import type { ShipGeekContext } from "./auth.server";
import { adminGraphql, userErrors } from "./graphql.server";
import { ConnectorError, parseListQuery } from "./http";
import {
  buildOrderCreateVariables,
  orderGid,
  orderSearchQuery,
  parseCreateOrder,
  toPublicOrder,
  toPublicTracking,
  type CreateOrderInput,
} from "./orders";
import { currentAppGid } from "./order-access.server";
import { externalIdTag } from "./tokens";

const ORDER_FIELDS = `#graphql
  fragment ConnectorOrder on Order {
    id
    name
    createdAt
    updatedAt
    displayFulfillmentStatus
    displayFinancialStatus
    currencyCode
    tags
    note
    totalPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
    externalId: metafield(namespace: "shipgeek", key: "external_id") {
      value
    }
    retailerOrderId: metafield(namespace: "shipgeek", key: "retailer_order_id") {
      value
    }
    sourceFulfillmentOrderId: metafield(namespace: "shipgeek", key: "source_fulfillment_order_id") {
      value
    }
    lineItems(first: 100) {
      nodes {
        id
        sku
        name
        quantity
        customAttributes {
          key
          value
        }
        variant {
          id
          sku
        }
      }
    }
    fulfillments(first: 20) {
      id
      createdAt
      displayStatus
      trackingInfo(first: 10) {
        company
        number
        url
      }
    }
    app {
      id
    }
  }
`;

type OrderNode = Parameters<typeof toPublicOrder>[0];

export async function listOrders(admin: ShipGeekContext["admin"], shop: string, url: URL) {
  const { limit, cursor } = parseListQuery(url);
  const query = orderSearchQuery(url);
  const data = await adminGraphql<{
    orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] };
  }>(
    admin,
    `#graphql
      ${ORDER_FIELDS}
      query ConnectorOrders($first: Int!, $after: String, $query: String) {
        orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ...ConnectorOrder
          }
        }
      }
    `,
    { first: limit, after: cursor, query },
  );

  const appId = await currentAppGid(admin, shop);
  return {
    orders: data.orders.nodes.filter((node) => createdByConnector(node, appId)).map((node) => {
      const { fulfillments, ...order } = toPublicOrder(node);
      void fulfillments;
      return order;
    }),
    pageInfo: {
      hasNextPage: data.orders.pageInfo.hasNextPage,
      cursor: data.orders.pageInfo.endCursor,
    },
  };
}

export async function readOrder(admin: ShipGeekContext["admin"], shop: string, id: string) {
  const node = await fetchOrder(admin, shop, orderGid(id));
  return node ? toPublicOrder(node) : null;
}

export async function readTracking(admin: ShipGeekContext["admin"], shop: string, id: string) {
  const node = await fetchOrder(admin, shop, orderGid(id));
  return node ? toPublicTracking(node) : null;
}

export async function createOrder(admin: ShipGeekContext["admin"], shop: string, body: unknown) {
  const input = parseCreateOrder(body);
  const existing = await findOrderByExternalId(admin, shop, input.externalId);
  if (existing) return { created: false, order: toPublicOrder(existing) };

  try {
    await prisma.orderRef.create({ data: { shop, externalId: input.externalId } });
  } catch (error) {
    if (!isUnique(error)) throw error;
    return resumeOrder(admin, shop, input.externalId);
  }

  try {
    const order = await createShopifyOrder(admin, input);
    await prisma.orderRef.update({
      where: { shop_externalId: { shop, externalId: input.externalId } },
      data: { orderId: order.id },
    });
    return { created: true, order: toPublicOrder(order) };
  } catch (error) {
    await prisma.orderRef.delete({ where: { shop_externalId: { shop, externalId: input.externalId } } }).catch(() => undefined);
    throw error;
  }
}

async function resumeOrder(admin: ShipGeekContext["admin"], shop: string, externalId: string) {
  const found = await findOrderByExternalId(admin, shop, externalId);
  if (found) {
    await prisma.orderRef.update({
      where: { shop_externalId: { shop, externalId } },
      data: { orderId: found.id },
    });
    return { created: false, order: toPublicOrder(found) };
  }

  const ref = await prisma.orderRef.findUnique({ where: { shop_externalId: { shop, externalId } } });
  const age = ref ? Date.now() - ref.createdAt.getTime() : Number.POSITIVE_INFINITY;
  if (age < 120_000) {
    throw new ConnectorError(409, "Order creation for this externalId is already in progress");
  }
  await prisma.orderRef.delete({ where: { shop_externalId: { shop, externalId } } });
  throw new ConnectorError(409, "The previous order creation did not finish. Retry the request");
}

async function createShopifyOrder(admin: ShipGeekContext["admin"], input: CreateOrderInput) {
  const variables = buildOrderCreateVariables(input);
  const data = await adminGraphql<{
    orderCreate: { order: OrderNode | null; userErrors: Array<{ message?: string }> };
  }>(
    admin,
    `#graphql
      ${ORDER_FIELDS}
      mutation ConnectorOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
        orderCreate(order: $order, options: $options) {
          order {
            ...ConnectorOrder
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    variables,
  );
  userErrors(data.orderCreate.userErrors, "Shopify rejected the order");
  if (!data.orderCreate.order) throw new ConnectorError(502, "Shopify did not return the order");
  return data.orderCreate.order;
}

async function findOrderByExternalId(admin: ShipGeekContext["admin"], shop: string, externalId: string) {
  const data = await adminGraphql<{ orders: { nodes: OrderNode[] } }>(
    admin,
    `#graphql
      ${ORDER_FIELDS}
      query ConnectorOrderByExternalId($query: String!) {
        orders(first: 1, query: $query) {
          nodes {
            ...ConnectorOrder
          }
        }
      }
    `,
    { query: `tag:${externalIdTag(externalId)}` },
  );
  const appId = await currentAppGid(admin, shop);
  const node = data.orders.nodes[0] || null;
  return createdByConnector(node, appId) ? node : null;
}

function createdByConnector(node: (OrderNode & { app?: { id?: string | null } | null }) | null | undefined, appId: string) {
  return Boolean(appId) && node?.app?.id === appId;
}

async function fetchOrder(admin: ShipGeekContext["admin"], shop: string, id: string) {
  const data = await adminGraphql<{ order: OrderNode | null }>(
    admin,
    `#graphql
      ${ORDER_FIELDS}
      query ConnectorOrder($id: ID!) {
        order(id: $id) {
          ...ConnectorOrder
        }
      }
    `,
    { id },
  );
  const appId = await currentAppGid(admin, shop);
  return createdByConnector(data.order, appId) ? data.order : null;
}

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
