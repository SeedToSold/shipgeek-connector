import { ConnectorError } from "./http";
import type { ShipGeekContext } from "./auth.server";

type GraphQLPayload<T> = {
  data?: T;
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
};

export async function adminGraphql<T>(admin: ShipGeekContext["admin"], query: string, variables?: Record<string, unknown>) {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  if (response.status === 429) throw new ConnectorError(429, "Shopify is throttling requests");
  if (!response.ok) throw new ConnectorError(502, "Shopify request failed");

  let payload: GraphQLPayload<T>;
  try {
    payload = (await response.json()) as GraphQLPayload<T>;
  } catch {
    throw new ConnectorError(502, "Shopify returned an unreadable response");
  }

  if (payload.errors?.length) {
    const throttled = payload.errors.some(
      (error) => error.extensions?.code === "THROTTLED" || /throttled/i.test(error.message || ""),
    );
    throw new ConnectorError(throttled ? 429 : 502, "Shopify request failed");
  }

  if (!payload.data) throw new ConnectorError(502, "Shopify returned an empty response");
  return payload.data;
}

export function userErrors(errors: Array<{ message?: string }> | undefined, fallback: string) {
  const messages = (errors || []).map((error) => error.message).filter((message): message is string => Boolean(message));
  if (!messages.length) return;
  throw new ConnectorError(422, messages.slice(0, 5).join(". ") || fallback);
}
