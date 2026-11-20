import type { LoaderFunctionArgs } from "react-router";
import { readOrder } from "../shipgeek/orders.server";
import { ConnectorError } from "../shipgeek/http";
import { result, shipgeekRoute } from "../shipgeek/route.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  return shipgeekRoute(request, "orders.read", async (context) => {
    const order = await readOrder(context.admin, params.id || "");
    if (!order) throw new ConnectorError(404, "Order not found");
    return result({ order }, 200, order.id);
  });
};
