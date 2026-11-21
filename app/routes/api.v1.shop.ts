import type { LoaderFunctionArgs } from "react-router";
import { adminGraphql } from "../shipgeek/graphql.server";
import { ConnectorError } from "../shipgeek/http";
import { API_CONTRACT, grantedScopeHandles } from "../shipgeek/scopes";
import { result, shipgeekRoute } from "../shipgeek/route.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return shipgeekRoute(request, "shop.read", async (context) => {
    const installation = await adminGraphql<{
      shop: { myshopifyDomain: string };
      currentAppInstallation: { accessScopes: Array<{ handle: string }> };
    }>(
      context.admin,
      `#graphql
        query ConnectorShop {
          shop { myshopifyDomain }
          currentAppInstallation {
            accessScopes {
              handle
            }
          }
        }
      `,
    );
    const shop = installation.shop?.myshopifyDomain?.trim();
    if (!shop) throw new ConnectorError(502, "Shopify did not return the connected store");

    return result({
      api: API_CONTRACT,
      shop,
      scopes: grantedScopeHandles(installation),
    });
  });
};
