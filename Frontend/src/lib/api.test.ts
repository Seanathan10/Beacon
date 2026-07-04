import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError } from "./api";

function mockFetch(status: number, body?: unknown, ok = status < 400) {
    return vi.fn().mockResolvedValue({
        ok,
        status,
        statusText: `HTTP ${status}`,
        json: async () => {
            if (body === undefined) throw new Error("no body");
            return body;
        },
        text: async () => (body === undefined ? "" : JSON.stringify(body)),
    } as unknown as Response);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("api client", () => {
    it("returns parsed JSON on success", async () => {
        vi.stubGlobal("fetch", mockFetch(200, { hello: "world" }));
        await expect(api.get<{ hello: string }>("/api/thing")).resolves.toEqual({ hello: "world" });
    });

    it("returns undefined for 204 No Content", async () => {
        vi.stubGlobal("fetch", mockFetch(204, undefined, true));
        await expect(api.delete("/api/thing/1")).resolves.toBeUndefined();
    });

    it("throws ApiError carrying the status and message on non-2xx", async () => {
        vi.stubGlobal("fetch", mockFetch(404, { message: "Pin not found" }));
        const err = (await api.get("/api/pins/999").catch((e) => e)) as ApiError;
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(404);
        expect(err.message).toBe("Pin not found");
    });

    it("sends credentials and JSON content-type for bodies", async () => {
        const f = mockFetch(201, { id: 1 });
        vi.stubGlobal("fetch", f);
        await api.post("/api/pins", { title: "x" });
        const [, init] = f.mock.calls[0];
        expect(init.credentials).toBe("include");
        expect(init.method).toBe("POST");
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
        expect(init.body).toBe(JSON.stringify({ title: "x" }));
    });
});
