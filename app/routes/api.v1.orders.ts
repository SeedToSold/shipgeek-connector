import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { createOrder, listOrders } from "../shipgeek/orders.server";
import { readJson } from "../shipgeek/http";
import { result, shipgeekRoute } from "../shipgeek/route.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return shipgeekRoute(request, "orders.list", async (context) => {
    const body = await listOrders(context.admin, new URL(request.url));
    return result(body);
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return shipgeekRoute(request, "orders.create", async (context) => {
    const created = await createOrder(context.admin, context.shop, await readJson(request));
    return result(created, created.created ? 201 : 200, created.order.id);
  });
};
