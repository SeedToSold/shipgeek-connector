import type { LoaderFunctionArgs } from "react-router";
import { adminGraphql } from "../shipgeek/graphql.server";
import { API_CONTRACT, grantedScopeHandles } from "../shipgeek/scopes";
import { result, shipgeekRoute } from "../shipgeek/route.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return shipgeekRoute(request, "shop.read", async (context) => {
    const installation = await adminGraphql<{
      currentAppInstallation: { accessScopes: Array<{ handle: string }> };
    }>(
      context.admin,
      `#graphql
        query ConnectorGrantedScopes {
          currentAppInstallation {
            accessScopes {
              handle
            }
          }
        }
      `,
    );

    return result({
      api: API_CONTRACT,
      shop: context.shop,
      scopes: grantedScopeHandles(installation),
    });
  });
};
