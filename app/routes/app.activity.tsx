import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const ACTION_LABELS: Record<string, string> = {
  "shop.read": "Read connection",
  "products.list": "List products",
  "products.read": "Read product",
  "orders.list": "List orders",
  "orders.read": "Read order",
  "orders.create": "Create order",
  "orders.tracking": "Read tracking",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const events = await prisma.auditEvent.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return {
    events: events.map((event) => ({
      id: event.id,
      action: ACTION_LABELS[event.action] || event.action,
      status: event.status,
      resourceId: event.resourceId,
      createdAt: event.createdAt.toISOString(),
    })),
  };
};

export default function Activity() {
  const { events } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Activity">
      <s-section heading="Recent ShipGeek calls">
        <s-paragraph>
          This log records the action, status, and resource id. It does not store request bodies, addresses, or tokens.
        </s-paragraph>
        {events.length === 0 ? <s-paragraph>ShipGeek has not called this connector yet.</s-paragraph> : null}
        <s-stack direction="block" gap="base">
          {events.map((event) => (
            <s-box key={event.id} padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="inline" gap="base">
                <s-text>{event.action}</s-text>
                <s-badge tone={event.status < 400 ? "success" : "critical"}>{String(event.status)}</s-badge>
                <s-text>{new Date(event.createdAt).toLocaleString()}</s-text>
              </s-stack>
              {event.resourceId ? <s-paragraph>{event.resourceId}</s-paragraph> : null}
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
