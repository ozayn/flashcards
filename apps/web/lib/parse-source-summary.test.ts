import { describe, expect, it } from "vitest";
import { parseSourceSummaryDisplay } from "./parse-source-summary";

describe("parseSourceSummaryDisplay", () => {
  it("returns plain for non-JSON", () => {
    const r = parseSourceSummaryDisplay("Just a paragraph.\n\nSecond line.");
    expect(r).toEqual({ kind: "plain", text: "Just a paragraph.\n\nSecond line." });
  });

  it("parses summary + bullet_points and unescapes via JSON.parse", () => {
    const raw = JSON.stringify({
      summary: 'He said "hello" to the team.',
      bullet_points: ["First idea", "Second idea"],
    });
    const r = parseSourceSummaryDisplay(raw);
    expect(r.kind).toBe("structured");
    if (r.kind === "structured") {
      expect(r.summary).toBe('He said "hello" to the team.');
      expect(r.bulletPoints).toEqual(["First idea", "Second idea"]);
    }
  });

  it("accepts camelCase bulletPoints", () => {
    const raw = JSON.stringify({
      summary: "Short intro.",
      bulletPoints: ["A", "B"],
    });
    const r = parseSourceSummaryDisplay(raw);
    expect(r.kind).toBe("structured");
    if (r.kind === "structured") {
      expect(r.bulletPoints).toEqual(["A", "B"]);
    }
  });

  it("falls back to plain on invalid JSON", () => {
    const raw = `{ not json`;
    const r = parseSourceSummaryDisplay(raw);
    expect(r).toEqual({ kind: "plain", text: raw });
  });

  it("falls back to plain when JSON has no usable summary or bullets", () => {
    const raw = JSON.stringify({ other: 1 });
    const r = parseSourceSummaryDisplay(raw);
    expect(r.kind).toBe("plain");
  });

  it("supports bullets-only", () => {
    const raw = JSON.stringify({ bullet_points: ["Only bullets"] });
    const r = parseSourceSummaryDisplay(raw);
    expect(r.kind).toBe("structured");
    if (r.kind === "structured") {
      expect(r.summary).toBe("");
      expect(r.bulletPoints).toEqual(["Only bullets"]);
    }
  });
});
