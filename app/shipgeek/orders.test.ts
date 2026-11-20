import assert from "node:assert/strict";
import test from "node:test";
import { buildOrderCreateVariables, orderSearchQuery, parseCreateOrder, toPublicOrder, toPublicTracking } from "./orders";

const address = {
  firstName: "Ada",
  lastName: "Lovelace",
  address1: "1 Analytical Way",
  city: "London",
  zip: "SW1A 1AA",
  countryCode: "gb",
  phone: "+44 20 0000 0000",
};

test("order reads omit customer contact and address fields", () => {
  const node = {
    id: "gid://shopify/Order/10",
    name: "#1001",
    createdAt: "2026-11-20T00:00:00Z",
    displayFulfillmentStatus: "FULFILLED",
    currencyCode: "USD",
    tags: ["shipgeek-ref-abc"],
    externalId: { value: "po-10" },
    email: "buyer@example.com",
    phone: "+1 555 0100",
    customer: { email: "buyer@example.com" },
    shippingAddress: address,
    billingAddress: address,
    lineItems: {
      nodes: [
        {
          id: "gid://shopify/LineItem/5",
          sku: "HAT",
          name: "Hat",
          quantity: 2,
          customAttributes: [{ key: "shipgeek_source_line_item_id", value: "44" }],
          variant: { id: "gid://shopify/ProductVariant/2", sku: "HAT" },
        },
      ],
    },
    fulfillments: [
      {
        id: "gid://shopify/Fulfillment/9",
        displayStatus: "DELIVERED",
        createdAt: "2026-11-20T01:00:00Z",
        trackingInfo: [{ company: "UPS", number: "1Z999", url: "https://track.example/1Z999" }],
      },
    ],
  };
  const order = toPublicOrder(node);

  const encoded = JSON.stringify(order);
  assert.equal(encoded.includes("buyer@example.com"), false);
  assert.equal(encoded.includes("Analytical"), false);
  assert.equal(encoded.includes("+44"), false);
  assert.equal(encoded.includes("Lovelace"), false);
  assert.equal(order.lineItems[0]?.sourceLineItemId, "44");
  assert.deepEqual(toPublicTracking(node).fulfillments[0]?.tracking[0], {
    company: "UPS",
    number: "1Z999",
    url: "https://track.example/1Z999",
  });
});

test("order search cannot filter by customer fields", () => {
  const url = new URL("https://connector.example/api/v1/orders?name=%231001&fulfillmentStatus=unfulfilled&externalId=po-10");
  const query = orderSearchQuery(url);
  assert.match(query || "", /name:#1001/);
  assert.match(query || "", /fulfillment_status:unfulfilled/);
  assert.match(query || "", /tag:shipgeek-ref-/);
  assert.equal((query || "").includes("po-10"), false);
  assert.throws(() => orderSearchQuery(new URL("https://connector.example/api/v1/orders?name=email:buyer@example.com")));
});

test("creating an order sends the address to Shopify and does not email the customer by default", () => {
  const input = parseCreateOrder({
    externalId: "po-10",
    currency: "USD",
    retailerOrderId: "700",
    shippingAddress: address,
    lineItems: [{ variantId: "2", quantity: 1, price: "15.50", sourceLineItemId: "44" }],
  });
  const variables = buildOrderCreateVariables(input);

  assert.equal(variables.options.sendReceipt, false);
  assert.equal(variables.options.sendFulfillmentReceipt, false);
  assert.equal(variables.order.shippingAddress.address1, "1 Analytical Way");
  assert.equal(variables.order.financialStatus, "PAID");
  assert.equal(variables.order.lineItems[0]?.variantId, "gid://shopify/ProductVariant/2");
  assert.equal(variables.order.lineItems[0]?.properties?.[0]?.value, "44");
  assert.equal(variables.order.metafields.some((field) => field.key === "retailer_order_id" && field.value === "700"), true);
  assert.throws(() => parseCreateOrder({ externalId: "po-10", lineItems: [{ variantId: "2", quantity: 1 }] }));
});
