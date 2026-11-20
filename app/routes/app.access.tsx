import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useRouteError } from "react-router";
import { useState, type ComponentType, type ReactNode } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createAccessToken } from "../shipgeek/tokens";

const AccessTokenField = "s-text-field" as unknown as ComponentType<{
  label: string;
  value: string;
  readOnly?: boolean;
  children?: ReactNode;
}>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tokens = await prisma.accessToken.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      lastFour: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });

  return {
    appUrl: process.env.SHOPIFY_APP_URL || "",
    tokens: tokens.map((token) => ({
      ...token,
      createdAt: token.createdAt.toISOString(),
      lastUsedAt: token.lastUsedAt?.toISOString() || null,
      revokedAt: token.revokedAt?.toISOString() || null,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "revoke") {
    const id = String(form.get("id") || "");
    await prisma.accessToken.updateMany({
      where: { id, shop: session.shop, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }

  const name = String(form.get("name") || "ShipGeek").trim().slice(0, 80) || "ShipGeek";
  const token = createAccessToken();
  await prisma.accessToken.create({
    data: {
      shop: session.shop,
      name,
      tokenHash: token.tokenHash,
      tokenPrefix: token.tokenPrefix,
      lastFour: token.lastFour,
    },
  });

  return { token: token.secret, name };
};

export default function Access() {
  const { appUrl, tokens } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const createdToken = actionData && "token" in actionData ? actionData.token : "";
  const [name, setName] = useState("ShipGeek");
  const shopify = useAppBridge();

  const copyToken = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      shopify.toast.show("Access token copied");
    } catch {
      shopify.toast.show("Could not copy the access token", { isError: true });
    }
  };

  return (
    <s-page heading="ShipGeek access">
      <s-section heading="Create a token">
        <s-paragraph>
          Give ShipGeek the connector URL and this token. ShipGeek calls this app instead of your Shopify Admin
          API. Revoke a token here to cut off access immediately. The Shopify token stays in this app.
        </s-paragraph>
        <s-box padding="base" background="subdued" borderRadius="base">
          <s-text>Connector URL</s-text>
          <s-paragraph>{appUrl || "Set SHOPIFY_APP_URL to this deployment's public URL."}</s-paragraph>
        </s-box>
        <s-stack direction="block" gap="large">
          <Form method="post">
            <input type="hidden" name="intent" value="create" />
            <input type="hidden" name="name" value={name} />
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Token name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <s-button type="submit" variant="primary">
                Create token
              </s-button>
            </s-stack>
          </Form>
          {createdToken ? (
            <s-banner tone="warning" heading="Copy this token now">
              <s-paragraph>This is the only time the full token is shown. ShipGeek stores it, and this app stores only a hash.</s-paragraph>
              <AccessTokenField label="Access token" value={createdToken} readOnly>
                <s-button slot="accessory" type="button" icon="clipboard" onClick={() => void copyToken()}>
                  Copy
                </s-button>
              </AccessTokenField>
            </s-banner>
          ) : null}
        </s-stack>
      </s-section>
      <s-section heading="Tokens">
        {tokens.length === 0 ? <s-paragraph>No tokens yet.</s-paragraph> : null}
        <s-stack direction="block" gap="base">
          {tokens.map((token) => (
            <s-box key={token.id} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base">
                  <s-text>{token.name}</s-text>
                  <s-text>
                    {token.tokenPrefix}…{token.lastFour}
                  </s-text>
                  <s-badge tone={token.revokedAt ? "critical" : "success"}>{token.revokedAt ? "Revoked" : "Active"}</s-badge>
                </s-stack>
                <s-paragraph>
                  Created {new Date(token.createdAt).toLocaleString()}
                  {token.lastUsedAt ? `. Last used ${new Date(token.lastUsedAt).toLocaleString()}` : ""}
                </s-paragraph>
                {token.revokedAt ? null : (
                  <Form method="post">
                    <input type="hidden" name="intent" value="revoke" />
                    <input type="hidden" name="id" value={token.id} />
                    <s-button type="submit" tone="critical">
                      Revoke
                    </s-button>
                  </Form>
                )}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
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
