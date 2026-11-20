import { ConnectorError, jsonData, jsonError } from "./http";
import { recordAudit, requireShipGeekAuth, type ShipGeekContext } from "./auth.server";

type RouteResult = {
  response: Response;
  resourceId?: string | null;
};

export async function shipgeekRoute(
  request: Request,
  action: string,
  run: (context: ShipGeekContext) => Promise<RouteResult>,
) {
  let context: ShipGeekContext | undefined;
  try {
    context = await requireShipGeekAuth(request);
    const result = await run(context);
    await recordAudit({
      shop: context.shop,
      tokenId: context.tokenId,
      action,
      status: result.response.status,
      resourceId: result.resourceId,
    });
    return result.response;
  } catch (error) {
    const status = error instanceof ConnectorError ? error.status : 500;
    if (context) {
      await recordAudit({ shop: context.shop, tokenId: context.tokenId, action, status });
    }
    if (error instanceof ConnectorError) return jsonError(status, error.message);
    console.error(`Connector ${action} failed`, error instanceof Error ? error.message : "unknown error");
    return jsonError(500, "Connector request failed");
  }
}

export function result(data: unknown, status = 200, resourceId?: string | null): RouteResult {
  return { response: jsonData(data, status), resourceId };
}
