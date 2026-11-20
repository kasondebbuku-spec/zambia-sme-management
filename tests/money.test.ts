import { describe, expect, it } from "vitest";
import { formatKwacha, margin, parseKwacha } from "../src/lib/money";

describe("formatKwacha", () => {
  it.each([
    [0, "K0.00"],
    [5, "K0.05"],
    [1250, "K12.50"],
    [125050, "K1,250.50"],
    [1234567800, "K12,345,678.00"],
    [-1500, "-K15.00"],
  ])("%i ngwee is %s", (ngwee, text) => {
    expect(formatKwacha(ngwee)).toBe(text);
  });
});

describe("parseKwacha", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.50", 1250],
    ["K12.50", 1250],
    ["k 7", 700],
    ["1,250", 125000],
    ["12,500.75", 1250075],
    ["1,000,000", 100000000],
    ["0.05", 5],
    ["  45.99 ", 4599],
  ])("reads %j as %i ngwee", (text, ngwee) => {
    expect(parseKwacha(text)).toBe(ngwee);
  });

  it.each(["", "abc", "12.505", "-5", "1.2.3", "12,50", "1,25,000", ",500", "K", "1e3"])("rejects %j", (text) => {
    expect(parseKwacha(text)).toBeNull();
  });

  it("has no floating-point error", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JavaScript; whole ngwee avoid it entirely
    expect((parseKwacha("0.10") ?? 0) + (parseKwacha("0.20") ?? 0)).toBe(30);
  });
});

describe("margin", () => {
  it("is the profit share of the selling price", () => {
    expect(margin(750, 1000)).toBe(0.25);
    expect(margin(1000, 1000)).toBe(0);
    expect(margin(1200, 1000)).toBe(-0.2); // selling at a loss
  });

  it("is null for free items", () => {
    expect(margin(100, 0)).toBeNull();
  });
});
