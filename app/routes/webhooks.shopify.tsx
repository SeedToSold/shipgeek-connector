import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { forwardWebhook } from "../shipgeek/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  try {
    await forwardWebhook(shop, topic, payload);
  } catch (error) {
    console.error(`Connector webhook forward failed for ${shop}`, error instanceof Error ? error.message : "unknown error");
    return new Response(null, { status: 500 });
  }

  return new Response();
};
