export const CONNECTOR_SCOPES = [
  "read_products",
  "read_inventory",
  "read_locations",
  "write_orders",
  "read_fulfillments",
] as const;

export function scopeGranted(granted: readonly string[], scope: string) {
  if (granted.includes(scope)) return true;
  if (scope.startsWith("read_")) return granted.includes(`write_${scope.slice(5)}`);
  return false;
}

export function missingScopes(granted: readonly string[], required: readonly string[] = CONNECTOR_SCOPES) {
  return required.filter((scope) => !scopeGranted(granted, scope));
}

export const API_CONTRACT = "shipgeek-connector/v1";
