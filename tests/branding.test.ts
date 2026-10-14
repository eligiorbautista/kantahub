// tests/branding.test.ts
import { describe, it, expect } from "vitest";
import { branding } from "@/lib/branding";

describe("branding", () => {
  it("exposes the locked name and taglines", () => {
    expect(branding.name).toBe("KantaHub");
    expect(branding.byline).toBe("by Eli Dev");
    expect(branding.headerTagline).toBe("KantaHub — Karaoke for your TV. by Eli Dev");
    expect(branding.footerTagline).toBe("Powered by Eli Dev");
  });
});
