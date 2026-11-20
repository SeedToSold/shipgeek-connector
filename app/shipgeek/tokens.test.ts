import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CONNECTOR_SCOPES, grantedScopeHandles, missingScopes, scopeGranted } from "./scopes";
import { createAccessToken, externalIdTag, hashToken } from "./tokens";

test("connector scopes match shopify.app.toml", () => {
  const toml = readFileSync(fileURLToPath(new URL("../../shopify.app.toml", import.meta.url)), "utf8");
  const scopes = toml.match(/scopes = "([^"]+)"/)?.[1]?.split(",") ?? [];
  assert.deepEqual([...scopes].sort(), [...CONNECTOR_SCOPES].sort());
  assert.equal(scopes.includes("read_customers"), false);
  assert.equal(scopes.includes("read_all_orders"), false);
  assert.equal(scopes.includes("write_products"), false);
});

test("write permissions cover the matching read permissions", () => {
  assert.equal(scopeGranted(["write_orders"], "read_orders"), true);
  assert.equal(scopeGranted(["write_draft_orders"], "read_draft_orders"), true);
  assert.deepEqual(missingScopes([...CONNECTOR_SCOPES]), []);
  assert.deepEqual(
    grantedScopeHandles({ currentAppInstallation: { accessScopes: [{ handle: "write_orders" }, { handle: null }] } }),
    ["write_orders"],
  );
});

test("access tokens are hashed and are not stored in the clear", () => {
  const token = createAccessToken();
  assert.match(token.secret, /^sgc_/);
  assert.equal(token.tokenHash, hashToken(token.secret));
  assert.equal(token.tokenHash.includes(token.secret), false);
  assert.equal(token.lastFour, token.secret.slice(-4));
  assert.notEqual(createAccessToken().secret, token.secret);
});

test("external id tags do not contain the raw id", () => {
  const tag = externalIdTag("retailer-order-42");
  assert.match(tag, /^shipgeek-ref-[a-f0-9]{24}$/);
  assert.equal(tag.includes("retailer-order-42"), false);
  assert.equal(externalIdTag("retailer-order-42"), tag);
});
