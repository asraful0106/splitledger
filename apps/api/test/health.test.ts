import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("GET /api/v1/health", () => {
  it("returns ok", async () => {
    const response = await request(createApp()).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "ok" } });
  });
});

describe("unknown routes", () => {
  it("returns the standard error shape", async () => {
    const response = await request(createApp()).get("/api/v1/nope");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "not_found", message: "Resource not found" },
    });
  });
});
