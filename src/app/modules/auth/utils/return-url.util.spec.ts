import { describe, expect, it } from "vitest";

import { DEFAULT_REDIRECT, isSafeReturnUrl, sanitizeReturnUrl } from "./return-url.util";

describe("isSafeReturnUrl", () => {
  it.each(["/main", "/main/users", "/main/users?page=2#top", "/main/branches/3/edit"])(
    "accepts the in-app path %s",
    (url) => expect(isSafeReturnUrl(url)).toBe(true),
  );

  it.each([
    null,
    undefined,
    "",
    "main/users", // not absolute
    "//evil.com", // protocol-relative
    "/\\evil.com", // backslash trick
    "/main\\..\\evil",
    "https://evil.com/main",
    "javascript:alert(1)",
    "java\tscript:alert(1)",
    "/main/users\nSet-Cookie: x=1",
    "/login", // not a known internal section
    "/other/path",
    "/",
  ])("rejects %j", (url) => expect(isSafeReturnUrl(url)).toBe(false));
});

describe("sanitizeReturnUrl", () => {
  it("keeps path, query and hash of a safe URL", () => {
    expect(sanitizeReturnUrl("/main/users?page=2#top")).toBe("/main/users?page=2#top");
  });

  it("normalises dot segments inside the app", () => {
    expect(sanitizeReturnUrl("/main/branches/../users")).toBe("/main/users");
  });

  it.each([null, "", "//evil.com", "https://evil.com", "/login"])(
    "falls back to the default for %j",
    (url) => expect(sanitizeReturnUrl(url)).toBe(DEFAULT_REDIRECT),
  );
});
