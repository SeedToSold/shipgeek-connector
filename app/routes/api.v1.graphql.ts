import type { ActionFunctionArgs } from "react-router";
import { assertOrderFulfillmentQuery, assertShipGeekOrderMetafield, isConnectorOrderMutation, isShipGeekOrderMetafieldMutation } from "../shipgeek/graphql-proxy";
import { ConnectorError, isRecord, readJson } from "../shipgeek/http";
import { result, shipgeekRoute } from "../shipgeek/route.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await readJson(request);
  const query = isRecord(body) && typeof body.query === "string" ? body.query : "";
  const variables = isRecord(body) && isRecord(body.variables) ? body.variables : undefined;

  const actionName = isConnectorOrderMutation(query) ? "orders.create" : isShipGeekOrderMetafieldMutation(query) ? "metafields.ensure" : "orders.query";

  return shipgeekRoute(request, actionName, async (context) => {
    if (!query) throw new ConnectorError(400, "Query is required");
    assertOrderFulfillmentQuery(query);
    if (isShipGeekOrderMetafieldMutation(query)) assertShipGeekOrderMetafield(variables);
    const response = await context.admin.graphql(query, variables ? { variables } : undefined);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload)) throw new ConnectorError(502, "Shopify request failed");

    return result({
      data: payload.data ?? null,
      errors: payload.errors ?? null,
      extensions: payload.extensions ?? null,
    });
  });
};
