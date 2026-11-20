export class ConnectorError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ConnectorError";
    this.status = status;
  }
}

const jsonHeaders = {
  "Cache-Control": "no-store",
};

export function jsonData(data: unknown, status = 200) {
  return Response.json(data, { status, headers: jsonHeaders });
}

export function jsonError(status: number, error: string) {
  return Response.json({ error }, { status, headers: jsonHeaders });
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 200_000) {
    throw new ConnectorError(413, "Request body is too large");
  }
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ConnectorError(400, "Request body must be JSON");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
