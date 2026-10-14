// tests/network.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildRemoteUrlFromBase, baseUrlForRequest } from "@/lib/network";

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

describe("baseUrlForRequest", () => {
  const prev = process.env.PUBLIC_URL;
  beforeEach(() => { delete process.env.PUBLIC_URL; });
  afterEach(() => { if (prev === undefined) delete process.env.PUBLIC_URL; else process.env.PUBLIC_URL = prev; });

  it("uses the request Host header when set (correct behind Docker)", () => {
    expect(baseUrlForRequest("192.168.1.50:3005")).toBe("http://192.168.1.50:3005");
  });
  it("prefers PUBLIC_URL over the Host header", () => {
    process.env.PUBLIC_URL = "http://kantahub.home:3005";
    expect(baseUrlForRequest("172.19.0.2:3005")).toBe("http://kantahub.home:3005");
  });
  it("falls back to auto-detection when there is no host", () => {
    expect(baseUrlForRequest(null)).toMatch(/^http:\/\//);
  });
});
