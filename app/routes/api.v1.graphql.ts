import type { ActionFunctionArgs } from "react-router";
import { assertOrderFulfillmentQuery } from "../shipgeek/graphql-proxy";
import { ConnectorError, isRecord, readJson } from "../shipgeek/http";
import { result, shipgeekRoute } from "../shipgeek/route.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return shipgeekRoute(request, "orders.query", async (context) => {
    const body = await readJson(request);
    if (!isRecord(body) || typeof body.query !== "string") throw new ConnectorError(400, "Query is required");
    assertOrderFulfillmentQuery(body.query);

    const variables = isRecord(body.variables) ? body.variables : undefined;
    const response = await context.admin.graphql(body.query, variables ? { variables } : undefined);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload)) throw new ConnectorError(502, "Shopify request failed");

    return result({
      data: payload.data ?? null,
      errors: payload.errors ?? null,
      extensions: payload.extensions ?? null,
    });
  });
};
