import assert from "node:assert/strict";
import test from "node:test";
import { productGid, productSearchQuery, toPublicProduct } from "./products";

test("product search stays on title and sku", () => {
  assert.equal(productSearchQuery("Blue hat"), "title:*Blue hat*");
  assert.equal(productSearchQuery("SKU-1"), "title:*SKU-1* OR sku:SKU-1");
  assert.throws(() => productSearchQuery("email:buyer@example.com"), /letters, numbers/);
});

test("product ids are normalized without accepting other resources", () => {
  assert.equal(productGid("99"), "gid://shopify/Product/99");
  assert.equal(productGid("gid://shopify/Product/99"), "gid://shopify/Product/99");
  assert.throws(() => productGid("gid://shopify/Customer/99"));
});

test("product responses keep catalog fields and drop anything else on the node", () => {
  const product = toPublicProduct({
    id: "gid://shopify/Product/1",
    title: "Hat",
    handle: "hat",
    status: "ACTIVE",
    vendor: "Mill",
    productType: "Apparel",
    tags: ["summer"],
    featuredImage: { url: "https://cdn.example/hat.jpg", altText: "Hat" },
    variants: {
      nodes: [
        {
          id: "gid://shopify/ProductVariant/2",
          title: "Default",
          sku: "HAT",
          barcode: "111",
          price: "12.00",
          inventoryItem: {
            id: "gid://shopify/InventoryItem/3",
            tracked: true,
            inventoryLevels: {
              nodes: [
                {
                  location: { id: "gid://shopify/Location/4", name: "Warehouse" },
                  quantities: [{ quantity: 8 }],
                },
              ],
            },
          },
        },
      ],
    },
  });

  assert.equal(product.variants[0]?.inventory[0]?.available, 8);
  assert.equal(JSON.stringify(product).includes("buyer@"), false);
});
