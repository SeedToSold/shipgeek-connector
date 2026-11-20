import assert from "node:assert/strict";
import test from "node:test";
import { assertNoCustomerData, assertOrderFulfillmentQuery, assertShipGeekOrderMetafield, isOrderFulfillmentQuery } from "./graphql-proxy";

test("order and fulfillment queries can be proxied", () => {
  assert.equal(isOrderFulfillmentQuery("#graphql\nquery { order(id: $id) { id fulfillments { id } } }"), true);
  assert.equal(isOrderFulfillmentQuery("query { fulfillmentOrders(first: 10) { nodes { id } } }"), true);
  assert.equal(isOrderFulfillmentQuery("query { draftOrder(id: $id) { id } }"), true);
  assert.equal(isOrderFulfillmentQuery("query DraftOrderRates { draftOrderAvailableDeliveryOptions(input: $input) { availableShippingRates { handle } } }"), true);
  assert.doesNotThrow(() => assertOrderFulfillmentQuery("query DraftOrderRates { draftOrderAvailableDeliveryOptions(input: $input) { availableShippingRates { handle } } }"));
});

test("order creation is proxied and other mutations stay off the proxy", () => {
  assert.equal(isOrderFulfillmentQuery("mutation orderCreate { orderCreate { order { id } } }"), false);
  assert.doesNotThrow(() => assertOrderFulfillmentQuery("mutation orderCreate { orderCreate { order { id } } }"));
  assert.doesNotThrow(() => assertOrderFulfillmentQuery("mutation orderCreateManualPayment { orderCreateManualPayment { order { id } } }"));
  assert.equal(isOrderFulfillmentQuery("mutation fulfillmentCreate($fulfillment: FulfillmentInput!) { fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id } } }"), false);
  assert.throws(() => assertOrderFulfillmentQuery("mutation fulfillmentCreate { fulfillmentCreate { fulfillment { id } } }"), /only proxies/);
  assert.equal(isOrderFulfillmentQuery("query { products(first: 10) { nodes { title } } }"), false);
  assert.equal(isOrderFulfillmentQuery('query { orders(query: "fulfillment") { nodes { id } } }'), true);
  assert.throws(() => assertOrderFulfillmentQuery("query { shop { name } }"), /only proxies/);
  assert.doesNotThrow(() => assertOrderFulfillmentQuery("mutation metafieldDefinitionCreate { metafieldDefinitionCreate { createdDefinition { id } } }"));
  assert.doesNotThrow(() => assertShipGeekOrderMetafield({ definition: { namespace: "shipgeek", ownerType: "ORDER" } }));
  assert.throws(() => assertShipGeekOrderMetafield({ definition: { namespace: "custom", ownerType: "PRODUCT" } }), /ShipGeek order metafields/);
  assert.throws(() => assertNoCustomerData("query { order(id: $id) { id email shippingAddress { address1 } } }"), /customer data/);
  assert.doesNotThrow(() => assertNoCustomerData("query { order(id: $id) { id name shippingLine { title } } }"));
});
