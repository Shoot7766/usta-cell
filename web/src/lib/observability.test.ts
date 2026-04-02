import { describe, expect, it, vi } from "vitest";
import { logStructured, logAppError } from "./observability";

describe("observability", () => {
  it("logStructured does not throw", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logStructured("error", "test", { a: 1 });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logAppError wraps non-Error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAppError("unit", "x");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
