import type { LoaderFunctionArgs } from "react-router";
import { readTracking } from "../shipgeek/orders.server";
import { ConnectorError } from "../shipgeek/http";
import { result, shipgeekRoute } from "../shipgeek/route.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  return shipgeekRoute(request, "orders.tracking", async (context) => {
    const tracking = await readTracking(context.admin, context.shop, params.id || "");
    if (!tracking) throw new ConnectorError(404, "Order not found");
    return result(tracking, 200, tracking.orderId);
  });
};
