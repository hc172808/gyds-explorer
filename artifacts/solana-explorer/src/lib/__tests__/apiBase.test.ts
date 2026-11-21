import { describe, expect, it } from "vitest";
import { normalizeApiBaseUrl } from "../apiBase";

describe("API base URL normalization", () => {
  it("keeps the same-origin API path for local hosting", () => {
    expect(normalizeApiBaseUrl("/api")).toBe("/api");
    expect(normalizeApiBaseUrl("")).toBe("/api");
  });

  it("adds the API path to a separate server origin", () => {
    expect(normalizeApiBaseUrl("https://api.example.com")).toBe("https://api.example.com/api");
  });

  it("does not duplicate an API path that is already present", () => {
    expect(normalizeApiBaseUrl("https://api.example.com/api/")).toBe("https://api.example.com/api");
  });
});
