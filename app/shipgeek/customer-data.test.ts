import assert from "node:assert/strict";
import test from "node:test";
import {
  appIdNumeric,
  collectResourceIds,
  omitCustomerSelections,
  querySelectsCustomerData,
  requestsForeignResource,
  scrubCustomerData,
  topicKind,
  webhookOrderCreatedByApp,
  webhookOrderGid,
  forwardableWebhookPayload,
  withoutUnownedResources,
} from "./customer-data";

const orderQuery = `#graphql
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      name
      email
      shippingAddress { firstName address1 phone }
      shipTo: shippingAddress { city }
      shippingLine { title }
      fulfillments { trackingInfo { company number } }
    }
  }
`;

test("order selections cannot ask for customer fields", () => {
  assert.equal(querySelectsCustomerData(orderQuery), true);
  const omitted = omitCustomerSelections(orderQuery);
  assert.equal(omitted.includes("email"), false);
  assert.equal(omitted.includes("shippingAddress"), false);
  assert.equal(omitted.includes("shipTo"), false);
  assert.equal(omitted.includes("address1"), false);
  assert.match(omitted, /shippingLine \{ title \}/);
  assert.match(omitted, /company number/);
  assert.equal(querySelectsCustomerData('query { order(id: $id) { id name shippingLine { title } } }'), false);
});

test("responses and webhooks drop customer fields and keep tracking", () => {
  const scrubbed = scrubCustomerData({
    id: "gid://shopify/Order/1",
    name: "#1001",
    email: "buyer@example.com",
    shippingAddress: { address1: "1 Analytical Way", phone: "+1 555" },
    shipping_address: { address1: "secret" },
    fulfillments: [{ trackingInfo: [{ company: "UPS", number: "1Z" }] }],
  });
  const encoded = JSON.stringify(scrubbed);
  assert.equal(encoded.includes("buyer@example.com"), false);
  assert.equal(encoded.includes("Analytical"), false);
  assert.equal(encoded.includes("secret"), false);
  assert.equal(encoded.includes("UPS"), true);
});

test("a requested order from another app is refused and search results omit it", () => {
  const explicit = collectResourceIds({ id: "gid://shopify/Order/9" }, true);
  const foreign = collectResourceIds({ id: "gid://shopify/Order/9" }, false);
  assert.equal(requestsForeignResource(explicit, foreign), true);

  const visible = withoutUnownedResources(
    {
      orders: {
        nodes: [
          { id: "gid://shopify/Order/2", name: "#DG2" },
          { id: "gid://shopify/Order/9", name: "#Other" },
        ],
      },
    },
    { orders: new Set(["gid://shopify/Order/2"]), fulfillments: new Set(), fulfillmentOrders: new Set() },
  );
  assert.deepEqual(visible, { orders: { nodes: [{ id: "gid://shopify/Order/2", name: "#DG2" }] } });
});

test("webhook forwarding recognizes connector orders only", () => {
  const appGid = "gid://shopify/App/55";
  assert.equal(appIdNumeric(appGid), "55");
  assert.equal(webhookOrderCreatedByApp({ app_id: 55, email: "a@b.c" }, appGid), true);
  assert.equal(webhookOrderCreatedByApp({ app_id: 9 }, appGid), false);
  assert.equal(webhookOrderCreatedByApp({}, appGid), false);
  assert.equal(webhookOrderCreatedByApp({ app_id: null }, appGid), false);
  assert.equal(topicKind("ORDERS_UPDATED"), "order");
  assert.equal(topicKind("orders/cancelled"), "order");
  assert.equal(topicKind("fulfillments/create"), "fulfillment");
  assert.equal(topicKind("products/update"), "other");
  assert.equal(webhookOrderGid({ id: 12, order_id: 44 }, "order"), "gid://shopify/Order/12");
  assert.equal(webhookOrderGid({ id: 12, order_id: 44 }, "fulfillment"), "gid://shopify/Order/44");
  assert.equal(webhookOrderGid({ id: 12, order: { id: "gid://shopify/Order/44" } }, "fulfillment"), "gid://shopify/Order/44");
  assert.equal(webhookOrderGid({ id: 12 }, "fulfillment"), "");
});

test("webhooks forward only when the connector created the order", async () => {
  const appGid = "gid://shopify/App/55";
  const owned = async (gid: string) => gid === "gid://shopify/Order/44";

  const created = await forwardableWebhookPayload("ORDERS_CREATE", { id: 44, app_id: 55, email: "a@b.c" }, appGid, owned);
  assert.equal(JSON.stringify(created).includes("a@b.c"), false);
  assert.equal((created as { id: number }).id, 44);

  assert.equal(await forwardableWebhookPayload("orders/updated", { id: 9, app_id: 9, email: "a@b.c" }, appGid, owned), null);
  assert.equal(await forwardableWebhookPayload("ORDERS_CANCELLED", { id: 44, app_id: 9 }, appGid, owned), null);
  assert.equal(await forwardableWebhookPayload("orders/updated", { id: 9 }, appGid, owned), null);

  const lookedUp = await forwardableWebhookPayload("orders/updated", { id: 44, email: "a@b.c" }, appGid, owned);
  assert.equal((lookedUp as { id: number }).id, 44);
  assert.equal(JSON.stringify(lookedUp).includes("a@b.c"), false);

  const fulfillment = await forwardableWebhookPayload(
    "fulfillments/create",
    { id: 999, order_id: 44, destination: { address1: "secret" } },
    appGid,
    owned,
  );
  assert.equal((fulfillment as { id: number }).id, 999);
  assert.equal(JSON.stringify(fulfillment).includes("secret"), false);
  assert.equal(await forwardableWebhookPayload("FULFILLMENTS_UPDATE", { id: 999, order_id: 9 }, appGid, owned), null);
  assert.equal(await forwardableWebhookPayload("fulfillments/update", { id: 44 }, appGid, owned), null);
  assert.equal(await forwardableWebhookPayload("products/update", { id: 44, app_id: 55 }, appGid, owned), null);
});
