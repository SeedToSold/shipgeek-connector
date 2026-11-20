import type { LoaderFunctionArgs } from "react-router";
import { readProduct } from "../shipgeek/catalog.server";
import { ConnectorError } from "../shipgeek/http";
import { result, shipgeekRoute } from "../shipgeek/route.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  return shipgeekRoute(request, "products.read", async (context) => {
    const product = await readProduct(context.admin, params.id || "");
    if (!product) throw new ConnectorError(404, "Product not found");
    return result({ product }, 200, product.id);
  });
};
