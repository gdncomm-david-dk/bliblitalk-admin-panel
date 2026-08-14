import { describe, it, expect } from "vitest";
import { AdminEventInput, RegisterInput, UpdateProfileInput, FeedbackInput } from "./schemas";

/**
 * SEC-012 (and bliblitalk-user-fe's SEC-003): URL-bearing fields used to be bare strings,
 * so a `javascript:` value survived the API and reached an anchor's href on the public
 * portal. These tests pin the scheme allowlist in the one place both apps consume.
 *
 * The event input is exercised through `AdminEventInput` rather than the bare `SafeUrl`
 * refinement because the refinement is not exported — the contract that matters is the one
 * the routes validate against, and testing it here means a future field added without
 * SafeUrl shows up as a failing test rather than as a silent gap.
 */
const baseEvent = {
  title: "Blibli Talk 11",
  description: "An event.",
  categoryId: "cat_1",
  location: "Jakarta",
  startsAt: "2026-09-01T02:00:00.000Z",
  endsAt: "2026-09-01T05:00:00.000Z",
};

const withUrl = (field: string, value: string) =>
  AdminEventInput.safeParse({ ...baseEvent, [field]: value });

describe("SafeUrl on event URL fields", () => {
  const fields = [
    "bannerUrl",
    "thumbnailUrl",
    "posterUrl",
    "mapsUrl",
    "recordingUrl",
    "presentationUrl",
  ];

  it("rejects the script and data schemes on every URL field", () => {
    for (const field of fields) {
      expect(withUrl(field, "javascript:alert(1)").success, field).toBe(false);
      expect(withUrl(field, "JavaScript:alert(1)").success, field).toBe(false);
      expect(withUrl(field, "data:text/html,<script>alert(1)</script>").success, field).toBe(false);
      expect(withUrl(field, "vbscript:msgbox(1)").success, field).toBe(false);
    }
  });

  it("rejects a protocol-relative URL, which leaves the site despite starting with a slash", () => {
    // The obvious "starts with /" test would accept this and land the user on evil.example.
    expect(withUrl("recordingUrl", "//evil.example/pwn").success).toBe(false);
  });

  it("accepts http(s) absolute URLs and single-slash relative paths", () => {
    expect(withUrl("recordingUrl", "https://drive.google.com/file/d/abc").success).toBe(true);
    expect(withUrl("bannerUrl", "http://intranet.local/banner.png").success).toBe(true);
    // POST /admin/uploads answers with exactly this shape, so it has to stay legal.
    expect(withUrl("bannerUrl", "/api/uploads/9f2c.png").success).toBe(true);
  });

  it("accepts the empty string, which is what a cleared admin form field submits", () => {
    expect(withUrl("recordingUrl", "").success).toBe(true);
  });

  it("caps URL length", () => {
    expect(withUrl("bannerUrl", `https://x.example/${"a".repeat(2100)}`).success).toBe(false);
  });

  it("applies the same rule to every gallery image, not just the first", () => {
    const res = AdminEventInput.safeParse({
      ...baseEvent,
      galleryImages: ["/api/uploads/ok.png", "javascript:alert(1)"],
    });
    expect(res.success).toBe(false);
  });
});

/**
 * bliblitalk-user-fe's review Finding 11: participant-authored free text was unbounded and
 * flows into the admin registrant CSV and the generated certificate.
 */
describe("free-text length bounds", () => {
  const applicant = {
    fullName: "Sinta Prameswari",
    email: "sinta.prameswari@example.com",
    phone: "+6281200000000",
  };

  it("rejects an oversized name but accepts a realistic one", () => {
    expect(RegisterInput.safeParse({ ...applicant, fullName: "a".repeat(121) }).success).toBe(false);
    expect(RegisterInput.safeParse(applicant).success).toBe(true);
  });

  it("bounds every optional profile field", () => {
    expect(
      RegisterInput.safeParse({ ...applicant, institution: "a".repeat(161) }).success,
    ).toBe(false);
    expect(RegisterInput.safeParse({ ...applicant, role: "a".repeat(121) }).success).toBe(false);
    expect(
      RegisterInput.safeParse({ ...applicant, yearsOfExperience: "a".repeat(41) }).success,
    ).toBe(false);
  });

  it("bounds the profile edit path the same way as registration", () => {
    expect(UpdateProfileInput.safeParse({ fullName: "a".repeat(121) }).success).toBe(false);
    expect(UpdateProfileInput.safeParse({ fullName: "Sinta Prameswari" }).success).toBe(true);
  });

  it("bounds feedback free text", () => {
    const ratings = {
      overallRating: 8,
      topicRating: 8,
      qnaRating: 8,
      contentRating: 8,
      speakerRating: 8,
      venueRating: 8,
      timingRating: 8,
      npsScore: 9,
    };
    expect(FeedbackInput.safeParse({ ...ratings, comments: "a".repeat(2001) }).success).toBe(false);
    expect(FeedbackInput.safeParse({ ...ratings, comments: "Great session." }).success).toBe(true);
  });
});
