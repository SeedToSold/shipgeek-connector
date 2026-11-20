import type { ActionFunctionArgs } from "react-router";
import { ConnectorError, readJson } from "../shipgeek/http";
import { result, shipgeekRoute } from "../shipgeek/route.server";
import { destinationFromBody } from "../shipgeek/webhooks";
import { clearDestination, saveDestination } from "../shipgeek/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "DELETE") {
    return shipgeekRoute(request, "webhooks.clear", async (context) => {
      await clearDestination(context.shop, context.admin);
      return result({ registered: false });
    });
  }

  if (request.method !== "PUT") throw new Response(null, { status: 405 });

  return shipgeekRoute(request, "webhooks.register", async (context) => {
    let destination;
    try {
      destination = destinationFromBody(await readJson(request));
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError(400, "Destination is required");
    }
    const registered = await saveDestination(context.shop, destination, context.admin);
    return result({ registered: true, callback: registered.callback });
  });
};
