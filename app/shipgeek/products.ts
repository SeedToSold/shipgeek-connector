import { ConnectorError } from "./http";

export type PublicProduct = {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  image: { url: string; altText: string | null } | null;
  variantsTruncated: boolean;
  variants: PublicVariant[];
};

export type PublicVariant = {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  inventoryItemId: string | null;
  tracked: boolean;
  inventory: Array<{ locationId: string; locationName: string; available: number }>;
};

type VariantNode = {
  id?: string;
  title?: string;
  sku?: string | null;
  barcode?: string | null;
  price?: string;
  inventoryItem?: {
    id?: string;
    tracked?: boolean;
    inventoryLevels?: {
      nodes?: Array<{
        location?: { id?: string; name?: string };
        quantities?: Array<{ quantity?: number }>;
      }>;
    };
  } | null;
};

type ProductNode = {
  id?: string;
  title?: string;
  handle?: string;
  status?: string;
  vendor?: string | null;
  productType?: string | null;
  tags?: string[];
  featuredImage?: { url?: string; altText?: string | null } | null;
  variants?: { pageInfo?: { hasNextPage?: boolean }; nodes?: VariantNode[] };
};

export function productSearchQuery(q: string | null) {
  if (!q) return undefined;
  const term = q.trim();
  if (!term) return undefined;
  if (!/^[\w\s.'-]{1,80}$/.test(term)) {
    throw new ConnectorError(400, "Product search accepts letters, numbers, spaces, and hyphens");
  }
  if (/\s/.test(term)) return `title:*${term}*`;
  return `title:*${term}* OR sku:${term}`;
}

export function toPublicProduct(node: ProductNode): PublicProduct {
  return {
    id: node.id || "",
    title: node.title || "",
    handle: node.handle || "",
    status: node.status || "",
    vendor: node.vendor || null,
    productType: node.productType || null,
    tags: node.tags || [],
    image: node.featuredImage?.url
      ? { url: node.featuredImage.url, altText: node.featuredImage.altText || null }
      : null,
    variantsTruncated: Boolean(node.variants?.pageInfo?.hasNextPage),
    variants: (node.variants?.nodes || []).map(toPublicVariant),
  };
}

function toPublicVariant(node: VariantNode): PublicVariant {
  return {
    id: node.id || "",
    title: node.title || "",
    sku: node.sku || null,
    barcode: node.barcode || null,
    price: node.price || "0.00",
    inventoryItemId: node.inventoryItem?.id || null,
    tracked: Boolean(node.inventoryItem?.tracked),
    inventory: (node.inventoryItem?.inventoryLevels?.nodes || []).flatMap((level) => {
      if (!level.location?.id) return [];
      const available = level.quantities?.[0]?.quantity;
      return [
        {
          locationId: level.location.id,
          locationName: level.location.name || "",
          available: typeof available === "number" ? available : 0,
        },
      ];
    }),
  };
}

export function parseListQuery(url: URL, maxLimit = 50) {
  const limit = Number(url.searchParams.get("limit") || "25");
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new ConnectorError(400, `limit must be an integer from 1 to ${maxLimit}`);
  }
  const cursor = url.searchParams.get("cursor");
  if (cursor && cursor.length > 512) {
    throw new ConnectorError(400, "cursor is too long");
  }
  return { limit, cursor: cursor || null };
}

export function productGid(id: string) {
  if (/^\d+$/.test(id)) return `gid://shopify/Product/${id}`;
  if (/^gid:\/\/shopify\/Product\/\d+$/.test(id)) return id;
  throw new ConnectorError(400, "Product id must be a Shopify product id");
}
