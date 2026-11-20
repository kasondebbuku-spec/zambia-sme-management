import { describe, expect, it } from "vitest";
import { failed, int, typed } from "../src/app/actions/result";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
};

describe("keeping what was typed after an error", () => {
  it("echoes ordinary fields back to the form", () => {
    expect(typed(form({ businessName: "Banda Hardware", email: "c@b.test" }))).toEqual({ businessName: "Banda Hardware", email: "c@b.test" });
  });

  it("never echoes passwords back", () => {
    const values = typed(form({ email: "c@b.test", password: "secret-value-1", newPassword: "secret-value-2" }));
    expect(values).toEqual({ email: "c@b.test" });
    expect(JSON.stringify(values)).not.toContain("secret");
  });

  it("leaves out React's own hidden fields", () => {
    expect(typed(form({ $ACTION_ID_abc: "x", "$ACTION_1:0": "y", name: "Sugar" }))).toEqual({ name: "Sugar" });
  });

  it("adds the values to an error result", () => {
    expect(failed({ error: "Wrong email or password." }, form({ email: "c@b.test", password: "x" }))).toEqual({
      error: "Wrong email or password.",
      values: { email: "c@b.test" },
    });
  });
});

describe("reading whole numbers from a form", () => {
  it.each([
    ["5", 5],
    [" 12 ", 12],
    ["-3", -3],
  ])("%j is %i", (raw, n) => expect(int(form({ q: raw }), "q")).toBe(n));

  it.each(["1.5", "abc", "1e3", "5 bags"])("%j is not a whole number", (raw) => expect(int(form({ q: raw }), "q")).toBeNaN());

  it("uses the fallback for an empty field", () => {
    expect(int(form({ q: "" }), "q", 0)).toBe(0);
  });
});
