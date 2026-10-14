// tests/network.test.ts
import { describe, it, expect } from "vitest";
import { buildRemoteUrlFromBase } from "@/lib/network";

describe("buildRemoteUrlFromBase", () => {
  it("appends the remote path and session", () => {
    expect(buildRemoteUrlFromBase("http://192.168.1.5:3000", "abc"))
      .toBe("http://192.168.1.5:3000/remote?session=abc");
  });
  it("tolerates a trailing slash", () => {
    expect(buildRemoteUrlFromBase("http://host:3000/", "x"))
      .toBe("http://host:3000/remote?session=x");
  });
});
