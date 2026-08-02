import { describe, expect, it, vi } from "vitest";
import { api, setCsrfToken } from "./api";

describe("api client", () => {
  it("sends credentials and csrf headers for unsafe requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: () =>
        Promise.resolve({
          id: "app-id",
          name: "orders",
          displayName: "Orders",
          sourceType: "image",
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("csrf-token");

    await api.apps.create({
      name: "orders",
      displayName: "Orders",
      sourceType: "image",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/apps",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.any(Headers),
      }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("x-csrf-token")).toBe("csrf-token");
  });
});
