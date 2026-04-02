import { describe, expect, it } from "vitest";
import { sanitizeText, sanitizeStringArray } from "./sanitize";

describe("sanitizeText", () => {
  it("trims and caps length", () => {
    expect(sanitizeText("  hello  ", 10)).toBe("hello");
    expect(sanitizeText("x".repeat(100), 5)).toBe("xxxxx");
  });

  it("strips null bytes", () => {
    expect(sanitizeText("a\u0000b", 10)).toBe("ab");
  });

  it("non-string returns empty", () => {
    expect(sanitizeText(null, 10)).toBe("");
  });
});

describe("sanitizeStringArray", () => {
  it("filters and caps items", () => {
    expect(sanitizeStringArray([" a ", "b", ""], 2)).toEqual(["a", "b"]);
  });
});
