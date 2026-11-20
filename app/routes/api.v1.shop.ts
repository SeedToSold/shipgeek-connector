import type { LoaderFunctionArgs } from "react-router";
import { API_CONTRACT, CONNECTOR_SCOPES } from "../shipgeek/scopes";
import { result, shipgeekRoute } from "../shipgeek/route.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return shipgeekRoute(request, "shop.read", async (context) =>
    result({
      api: API_CONTRACT,
      shop: context.shop,
      scopes: CONNECTOR_SCOPES,
    }),
  );
};
