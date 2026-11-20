import type { LoaderFunctionArgs } from "react-router";
import { listProducts } from "../shipgeek/catalog.server";
import { result, shipgeekRoute } from "../shipgeek/route.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return shipgeekRoute(request, "products.list", async (context) => {
    const body = await listProducts(context.admin, new URL(request.url));
    return result(body);
  });
};
