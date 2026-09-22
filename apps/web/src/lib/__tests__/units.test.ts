import { describe, expect, it } from "vitest";
import { formatDistance, formatElevation, formatFeet, formatMiles } from "../units";

describe("unit formatting", () => {
  it("formats distance in km with miles alongside", () => {
    expect(formatDistance(5)).toBe("5 km (3.1 mi)");
    expect(formatDistance(42.2)).toBe("42.2 km (26.2 mi)");
    expect(formatDistance(0)).toBe("0 km (0 mi)");
    expect(formatMiles(200)).toBe("124 mi");
  });

  it("formats elevation in m with feet alongside", () => {
    expect(formatElevation(120)).toBe("120 m (394 ft)");
    expect(formatElevation(0)).toBe("0 m (0 ft)");
    expect(formatFeet(-10)).toBe("-33 ft");
  });

  it("prefixes positive signed elevations", () => {
    expect(formatElevation(50, { signed: true })).toBe("+50 m (+164 ft)");
    expect(formatElevation(-5, { signed: true })).toBe("-5 m (-16 ft)");
  });
});
