export const CONNECTOR_SCOPES = [
  "read_assigned_fulfillment_orders",
  "write_draft_orders",
  "read_draft_orders",
  "read_fulfillments",
  "read_inventory",
  "read_locations",
  "read_merchant_managed_fulfillment_orders",
  "write_order_edits",
  "read_orders",
  "write_orders",
  "read_products",
  "read_shipping",
  "read_third_party_fulfillment_orders",
] as const;

export function scopeGranted(granted: readonly string[], scope: string) {
  if (granted.includes(scope)) return true;
  if (scope.startsWith("read_")) return granted.includes(`write_${scope.slice(5)}`);
  return false;
}

export function missingScopes(granted: readonly string[], required: readonly string[] = CONNECTOR_SCOPES) {
  return required.filter((scope) => !scopeGranted(granted, scope));
}

export function grantedScopeHandles(installation: {
  currentAppInstallation?: { accessScopes?: Array<{ handle?: string | null }> } | null;
}) {
  return (installation.currentAppInstallation?.accessScopes || [])
    .map((scope) => scope.handle)
    .filter((handle): handle is string => Boolean(handle));
}

export const API_CONTRACT = "shipgeek-connector/v1";
