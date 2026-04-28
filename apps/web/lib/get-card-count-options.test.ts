import { describe, expect, it } from "vitest";
import {
  getCardCountOptions,
  MAX_CARDS_ADMIN,
  MAX_CARDS_REGULAR_DEFAULT,
} from "@/components/user-selector";

describe("getCardCountOptions", () => {
  it("caps non-admin choices at 10 when tier usage is unknown (matches API free tier)", () => {
    expect(getCardCountOptions(false, null)).toEqual([5, 10]);
  });

  it("uses GET /users max_cards_per_deck when provided", () => {
    expect(getCardCountOptions(false, 10)).toEqual([5, 10]);
    expect(getCardCountOptions(false, 7)).toEqual([5]);
  });

  it("allows full admin ladder when admin", () => {
    const opts = getCardCountOptions(true, null);
    expect(opts[opts.length - 1]).toBe(MAX_CARDS_ADMIN);
    expect(opts).toContain(MAX_CARDS_REGULAR_DEFAULT);
  });
});
