import { vi } from "vitest";

export function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

export function textResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

type FetchHandler = (url: string, init: RequestInit | undefined) => Response | undefined;

export function stubFetch(handler: FetchHandler) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const response = handler(url, init);
    if (!response) {
      throw new Error(`Unhandled fetch: ${init?.method ?? "GET"} ${url}`);
    }
    return response;
  });

  vi.stubGlobal("fetch", mock);
  return mock;
}
