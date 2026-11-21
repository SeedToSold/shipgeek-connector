import type { ActionFunctionArgs } from "react-router";
import { assertNoCustomerData, assertOrderFulfillmentQuery, assertShipGeekOrderMetafield, isConnectorOrderMutation, isShipGeekOrderMetafieldMutation } from "../shipgeek/graphql-proxy";
import { restrictGraphQLPayload } from "../shipgeek/order-access.server";
import { ConnectorError, isRecord, readJson } from "../shipgeek/http";
import { result, shipgeekRoute } from "../shipgeek/route.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await readJson(request);
  const query = isRecord(body) && typeof body.query === "string" ? body.query : "";
  const variables = isRecord(body) && isRecord(body.variables) ? body.variables : undefined;

  const actionName = isShipGeekOrderMetafieldMutation(query)
    ? "metafields.ensure"
    : !isConnectorOrderMutation(query)
      ? "orders.query"
      : /\borderCancel\b/.test(query)
        ? "orders.cancel"
        : /\bfulfillment/.test(query)
          ? "fulfillments.update"
          : /\b(?:orderCreate|draftOrder)/.test(query)
            ? "orders.create"
            : "orders.update";

  return shipgeekRoute(request, actionName, async (context) => {
    if (!query) throw new ConnectorError(400, "Query is required");
    assertOrderFulfillmentQuery(query);
    assertNoCustomerData(query);
    if (isShipGeekOrderMetafieldMutation(query)) assertShipGeekOrderMetafield(variables);
    const response = await context.admin.graphql(query, variables ? { variables } : undefined);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload)) throw new ConnectorError(502, "Shopify request failed");
    const safe = await restrictGraphQLPayload(context.admin, context.shop, payload, variables, query);

    return result({
      data: safe.data ?? null,
      errors: safe.errors ?? null,
      extensions: safe.extensions ?? null,
    });
  });
};
