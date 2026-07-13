import { afterEach, describe, expect, it, vi } from "vitest";
import { captureToken, getToken, resetTokenForTests } from "./token";

afterEach(() => {
  resetTokenForTests();
});

describe("captureToken", () => {
  it("captures the token from the fragment and strips it from the URL", () => {
    const replaceState = vi.fn();
    const result = captureToken(
      { hash: "#token=s3cret-value", pathname: "/", search: "" },
      { replaceState }
    );
    expect(result).toBe("s3cret-value");
    expect(getToken()).toBe("s3cret-value");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/");
  });

  it("preserves the path and query when stripping the fragment", () => {
    const replaceState = vi.fn();
    captureToken({ hash: "#token=abc", pathname: "/app", search: "?x=1" }, { replaceState });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/app?x=1");
  });

  it("percent-decodes the token value", () => {
    const replaceState = vi.fn();
    captureToken({ hash: "#token=a%2Bb", pathname: "/", search: "" }, { replaceState });
    expect(getToken()).toBe("a+b");
  });

  it("returns null and leaves the URL alone when no token is present", () => {
    const replaceState = vi.fn();
    const result = captureToken({ hash: "", pathname: "/", search: "" }, { replaceState });
    expect(result).toBeNull();
    expect(getToken()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("treats an empty token value as absent", () => {
    const replaceState = vi.fn();
    const result = captureToken({ hash: "#token=", pathname: "/", search: "" }, { replaceState });
    expect(result).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
