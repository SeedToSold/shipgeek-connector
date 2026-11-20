import type { LoaderFunctionArgs } from "react-router";
import { API_CONTRACT } from "../shipgeek/scopes";
import { jsonData } from "../shipgeek/http";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET") return jsonData({ error: "Method not allowed" }, 405);
  return jsonData({ ok: true, api: API_CONTRACT });
};
