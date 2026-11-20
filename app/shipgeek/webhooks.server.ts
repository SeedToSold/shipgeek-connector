import prisma from "../db.server";
import type { ShipGeekContext } from "./auth.server";
import { adminGraphql, userErrors } from "./graphql.server";
import { ORDER_WEBHOOKS, signWebhook, webhookCallbackUrl } from "./webhooks";

type Subscription = { id: string; topic: string; uri: string | null };

export async function ensureOrderWebhooks(admin: ShipGeekContext["admin"], appUrl: string) {
  const callback = webhookCallbackUrl(appUrl);
  const data = await adminGraphql<{ webhookSubscriptions: { nodes: Subscription[] } }>(
    admin,
    `#graphql
      query ConnectorWebhookSubscriptions {
        webhookSubscriptions(first: 50) {
          nodes {
            id
            topic
            uri
          }
        }
      }
    `,
  );
  const existing = data.webhookSubscriptions.nodes;

  for (const webhook of ORDER_WEBHOOKS) {
    const matches = existing.filter((subscription) => subscription.topic === webhook.topic);
    const current = matches.find((subscription) => subscription.uri === callback);

    for (const subscription of matches.filter((item) => item !== current && (item.uri || "").includes("/webhooks/shopify"))) {
      const removed = await adminGraphql<{ webhookSubscriptionDelete: { userErrors: Array<{ message?: string }> } }>(
        admin,
        `#graphql
          mutation ConnectorWebhookDelete($id: ID!) {
            webhookSubscriptionDelete(id: $id) {
              deletedWebhookSubscriptionId
              userErrors { message }
            }
          }
        `,
        { id: subscription.id },
      );
      userErrors(removed.webhookSubscriptionDelete.userErrors, "Could not replace the webhook");
    }

    if (current) continue;

    const created = await adminGraphql<{
      webhookSubscriptionCreate: { userErrors: Array<{ message?: string }> };
    }>(
      admin,
      `#graphql
        mutation ConnectorWebhookCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription { id }
            userErrors { message }
          }
        }
      `,
      {
        topic: webhook.topic,
        webhookSubscription: {
          uri: callback,
          format: "JSON",
          ...("metafieldNamespaces" in webhook ? { metafieldNamespaces: webhook.metafieldNamespaces } : {}),
        },
      },
    );
    userErrors(created.webhookSubscriptionCreate.userErrors, "Could not register the webhook");
  }

  return { callback };
}

export async function saveDestination(shop: string, destination: { url: string; secret: string }, admin: ShipGeekContext["admin"]) {
  await prisma.webhookDestination.upsert({
    where: { shop },
    update: destination,
    create: { shop, ...destination },
  });
  return ensureOrderWebhooks(admin, process.env.SHOPIFY_APP_URL || "");
}

export async function forwardWebhook(shop: string, topic: string, payload: unknown, fetchImpl: typeof fetch = fetch) {
  const destination = await prisma.webhookDestination.findUnique({ where: { shop } });
  if (!destination) return false;

  const body = JSON.stringify(payload ?? {});
  const response = await fetchImpl(destination.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ShipGeek-Shop": shop,
      "X-ShipGeek-Topic": topic,
      "X-ShipGeek-Signature": signWebhook(destination.secret, body),
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`ShipGeek rejected the webhook (${response.status})`);
  return true;
}

export async function clearDestination(shop: string, admin: ShipGeekContext["admin"]) {
  await prisma.webhookDestination.deleteMany({ where: { shop } });
  if (!process.env.SHOPIFY_APP_URL) return;
  const callback = webhookCallbackUrl(process.env.SHOPIFY_APP_URL);

  const data = await adminGraphql<{ webhookSubscriptions: { nodes: Subscription[] } }>(
    admin,
    `#graphql
      query ConnectorWebhookSubscriptions {
        webhookSubscriptions(first: 50) {
          nodes { id topic uri }
        }
      }
    `,
  );
  for (const subscription of data.webhookSubscriptions.nodes) {
    if (subscription.uri !== callback) continue;
    await adminGraphql(
      admin,
      `#graphql
        mutation ConnectorWebhookDelete($id: ID!) {
          webhookSubscriptionDelete(id: $id) {
            deletedWebhookSubscriptionId
            userErrors { message }
          }
        }
      `,
      { id: subscription.id },
    );
  }
}
