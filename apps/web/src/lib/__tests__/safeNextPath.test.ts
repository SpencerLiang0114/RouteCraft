import { describe, expect, it } from "vitest";
import { safeNextPath } from "../safeNextPath";

describe("safeNextPath", () => {
  it("keeps same-origin app paths", () => {
    expect(safeNextPath("/saved")).toBe("/saved");
    expect(safeNextPath("/results?route=saved-1#map")).toBe("/results?route=saved-1#map");
    expect(safeNextPath("/share/abc?next=https://x.example")).toBe("/share/abc?next=https://x.example");
  });

  it("falls back for missing or non-path values", () => {
    expect(safeNextPath(null)).toBe("/saved");
    expect(safeNextPath(undefined)).toBe("/saved");
    expect(safeNextPath("")).toBe("/saved");
    expect(safeNextPath("saved")).toBe("/saved");
    expect(safeNextPath("https://evil.example")).toBe("/saved");
    expect(safeNextPath("javascript:alert(1)")).toBe("/saved");
  });

  it("rejects protocol-relative and traversal paths", () => {
    expect(safeNextPath("//evil.example")).toBe("/saved");
    expect(safeNextPath("/../etc/passwd")).toBe("/saved");
  });

  it("rejects dot segments that normalize to a protocol-relative path", () => {
    for (const raw of ["/.//evil.example", "/%2e//evil.example", "/a/.%2e//evil.example", "/x/%2e%2e//evil.example"]) {
      expect(new URL(raw, "http://routecraft.invalid").pathname).toBe("//evil.example");
      expect(safeNextPath(raw)).toBe("/saved");
    }
  });

  it("returns the normalized path", () => {
    expect(safeNextPath("/./saved")).toBe("/saved");
    expect(safeNextPath("/results/./?route=saved-1")).toBe("/results/?route=saved-1");
  });

  it("rejects backslash and control-character bypasses", () => {
    for (const raw of ["/\\evil.example", "/\\/evil.example", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example"]) {
      // The URL parser itself resolves each of these to another host.
      expect(new URL(raw, "http://routecraft.invalid").origin).toBe("http://evil.example");
      expect(safeNextPath(raw)).toBe("/saved");
    }
  });
});
