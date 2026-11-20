import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { destinationFromBody, ORDER_WEBHOOKS, signWebhook, webhookCallbackUrl } from "./webhooks";

test("order webhooks cover create and update for orders and fulfillments", () => {
  assert.deepEqual(
    ORDER_WEBHOOKS.map((webhook) => webhook.topic),
    ["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED", "FULFILLMENTS_CREATE", "FULFILLMENTS_UPDATE"],
  );
  assert.equal(webhookCallbackUrl("https://connector.example.com"), "https://connector.example.com/webhooks/shopify");
});

test("webhook signatures match the raw body", () => {
  const body = JSON.stringify({ id: 10 });
  assert.equal(signWebhook("secret-value-1234", body), createHmac("sha256", "secret-value-1234").update(body).digest("hex"));
  assert.equal(destinationFromBody({ url: "https://app.shipgeek.com/api/connector/webhook", secret: "secret-value-1234" }).url, "https://app.shipgeek.com/api/connector/webhook");
  assert.throws(() => destinationFromBody({ url: "http://app.shipgeek.com/hook", secret: "secret-value-1234" }), /HTTPS/);
});
