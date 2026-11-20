import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { missingScopes } from "../shipgeek/scopes";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const granted = (session.scope || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  const missing = missingScopes(granted);
  const activeTokens = await prisma.accessToken.count({
    where: { shop: session.shop, revokedAt: null },
  });

  return {
    shop: session.shop,
    granted,
    missing,
    activeTokens,
    appUrl: process.env.SHOPIFY_APP_URL || "",
  };
};

export default function Index() {
  const { shop, granted, missing, activeTokens, appUrl } = useLoaderData<typeof loader>();

  return (
    <s-page heading="ShipGeek Connector">
      <s-section heading="Your store stays in your hands">
        <s-paragraph>
          This app runs on your infrastructure and is embedded in your Shopify admin. ShipGeek does not install its
          own app on this store. It calls the connector with a token you create, and you can revoke that token at any
          time.
        </s-paragraph>
        {missing.length ? (
          <s-banner tone="warning" heading="Reopen the app to grant the remaining permissions">
            <s-paragraph>Missing: {missing.join(", ")}</s-paragraph>
          </s-banner>
        ) : (
          <s-banner tone="success" heading="Ready for ShipGeek">
            <s-paragraph>
              {activeTokens
                ? `${activeTokens} active token${activeTokens === 1 ? "" : "s"}.`
                : "Create a token on the Access page, then give ShipGeek the connector URL and token."}
            </s-paragraph>
          </s-banner>
        )}
      </s-section>
      <s-section heading="What ShipGeek can ask for">
        <s-unordered-list>
          <s-list-item>Products, variants, SKUs, prices, and inventory levels</s-list-item>
          <s-list-item>Create an order and read it back</s-list-item>
          <s-list-item>Fulfillment status and tracking numbers</s-list-item>
        </s-unordered-list>
      </s-section>
      <s-section heading="What stays here">
        <s-paragraph>
          The Shopify Admin API token never leaves this server. Read responses omit customer name, email, phone, and
          address. Creating an order still sends a shipping address to Shopify so you can ship it. That address is not
          stored in the activity log and is not returned by later reads.
        </s-paragraph>
        <s-paragraph>
          Order reads cover the last 60 days, which is the standard Shopify order permission. This app does not request
          access to all historical orders, customers, discounts, content, or shop settings.
        </s-paragraph>
      </s-section>
      <s-section slot="aside" heading="This installation">
        <s-paragraph>
          <s-text>Shop: </s-text>
          {shop}
        </s-paragraph>
        <s-paragraph>
          <s-text>Connector URL: </s-text>
          {appUrl || "Not set"}
        </s-paragraph>
        <s-paragraph>
          <s-text>Granted permissions: </s-text>
          {granted.length ? granted.join(", ") : "None recorded yet"}
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
