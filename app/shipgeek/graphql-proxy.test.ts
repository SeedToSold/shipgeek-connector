import assert from "node:assert/strict";
import test from "node:test";
import { assertOrderFulfillmentQuery, isOrderFulfillmentQuery } from "./graphql-proxy";

test("order and fulfillment queries can be proxied", () => {
  assert.equal(isOrderFulfillmentQuery("#graphql\nquery { order(id: $id) { id fulfillments { id } } }"), true);
  assert.equal(isOrderFulfillmentQuery("query { fulfillmentOrders(first: 10) { nodes { id } } }"), true);
  assert.equal(isOrderFulfillmentQuery("query { draftOrder(id: $id) { id } }"), true);
});

test("mutations and other reads stay off the proxy", () => {
  assert.equal(isOrderFulfillmentQuery("mutation fulfillmentCreate($fulfillment: FulfillmentInput!) { fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id } } }"), false);
  assert.equal(isOrderFulfillmentQuery("query { products(first: 10) { nodes { title } } }"), false);
  assert.equal(isOrderFulfillmentQuery('query { orders(query: "fulfillment") { nodes { id } } }'), true);
  assert.throws(() => assertOrderFulfillmentQuery("query { shop { name } }"), /only proxies order and fulfillment/);
});
