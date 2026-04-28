import { describe, expect, it } from "vitest";
import { readApiErrorMessage } from "./api";

describe("readApiErrorMessage", () => {
  it("returns string detail unchanged", async () => {
    const res = new Response(JSON.stringify({ detail: "plain error" }), { status: 400 });
    await expect(readApiErrorMessage(res, "fallback")).resolves.toBe("plain error");
  });

  it("extracts message from structured deck-limit detail (403)", async () => {
    const msg = "Free plan: up to 5 decks. Delete or archive one to create another.";
    const res = new Response(
      JSON.stringify({
        detail: {
          code: "FREE_TIER_MAX_DECKS",
          message: msg,
        },
      }),
      { status: 403 }
    );
    await expect(readApiErrorMessage(res, "fallback")).resolves.toBe(msg);
  });
});
