import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { shipGeekWebhookPayload } from "../shipgeek/order-access.server";
import { forwardWebhook } from "../shipgeek/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop, topic, payload } = await authenticate.webhook(request);

  try {
    if (admin) {
      const safe = await shipGeekWebhookPayload(admin, shop, topic, payload);
      if (safe) await forwardWebhook(shop, topic, safe);
    }
  } catch (error) {
    console.error(`Connector webhook forward failed for ${shop}`, error instanceof Error ? error.message : "unknown error");
    return new Response(null, { status: 500 });
  }

  return new Response();
};
