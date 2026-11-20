import { adminGraphql } from "./graphql.server";
import type { ShipGeekContext } from "./auth.server";
import { parseListQuery, productGid, productSearchQuery, toPublicProduct } from "./products";

const PRODUCT_FIELDS = `#graphql
  fragment ConnectorProduct on Product {
    id
    title
    handle
    status
    vendor
    productType
    tags
    featuredImage {
      url
      altText
    }
    variants(first: 100) {
      pageInfo {
        hasNextPage
      }
      nodes {
        id
        title
        sku
        barcode
        price
        inventoryItem {
          id
          tracked
          inventoryLevels(first: 20) {
            nodes {
              location {
                id
                name
              }
              quantities(names: ["available"]) {
                quantity
              }
            }
          }
        }
      }
    }
  }
`;

export async function listProducts(admin: ShipGeekContext["admin"], url: URL) {
  const { limit, cursor } = parseListQuery(url);
  const query = productSearchQuery(url.searchParams.get("q"));
  const data = await adminGraphql<{
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Parameters<typeof toPublicProduct>[0][];
    };
  }>(
    admin,
    `#graphql
      ${PRODUCT_FIELDS}
      query ConnectorProducts($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ...ConnectorProduct
          }
        }
      }
    `,
    { first: limit, after: cursor, query },
  );

  return {
    products: data.products.nodes.map(toPublicProduct),
    pageInfo: {
      hasNextPage: data.products.pageInfo.hasNextPage,
      cursor: data.products.pageInfo.endCursor,
    },
  };
}

export async function readProduct(admin: ShipGeekContext["admin"], id: string) {
  const data = await adminGraphql<{ product: Parameters<typeof toPublicProduct>[0] | null }>(
    admin,
    `#graphql
      ${PRODUCT_FIELDS}
      query ConnectorProduct($id: ID!) {
        product(id: $id) {
          ...ConnectorProduct
        }
      }
    `,
    { id: productGid(id) },
  );
  if (!data.product) return null;
  return toPublicProduct(data.product);
}
