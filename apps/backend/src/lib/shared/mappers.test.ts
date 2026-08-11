import { describe, it, expect } from "vitest";
import { toEventDTO, type EventWithRelations } from "./mappers";

/**
 * TS-028 (unit half). `toEventDTO` is the single read boundary every admin and portal response
 * passes through, and it is the layer where an image field goes missing without anything failing:
 * all three are optional and nullable, so dropping one from this literal still typechecks. The
 * round trip through the HTTP routes is asserted in `routes/admin/adminEvents.routes.test.ts`;
 * this asserts the mapping itself, so a regression points at the line that caused it.
 */
const baseEvent: EventWithRelations = {
  id: "evt_1",
  slug: "sample-event",
  eventCode: null,
  title: "Sample Event",
  subtitle: null,
  bannerUrl: null,
  thumbnailUrl: null,
  posterUrl: null,
  description: "desc",
  categoryId: "cat_1",
  category: {
    id: "cat_1",
    name: "Self Development",
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  tags: [],
  location: "Blibli HQ",
  startsAt: new Date("2026-06-11T11:30:00.000Z"),
  endsAt: new Date("2026-06-11T13:30:00.000Z"),
  capacity: 100,
  status: "REGISTRATION_OPEN",
  statusChangedAt: new Date("2026-06-01T00:00:00.000Z"),
  isOverdue: false,
  gracePeriodMinutes: 120,
  autoCompleteAfterMinutes: 2880,
  selectionMode: "FCFS",
  hasSpeedDating: false,
  featured: false,
  recommended: false,
  ownerId: null,
  showRemainingSeats: true,
  enableCertificate: true,
  enableFeedback: false,
  waitingListEnabled: true,
  registrationOpensAt: null,
  publishedAt: null,
  venue: null,
  mapsUrl: null,
  registrationDeadline: null,
  eventType: null,
  dressCode: null,
  language: null,
  organizedBy: null,
  importantNotes: null,
  learningPoints: [],
  discussionPoints: [],
  agenda: [],
  faqs: [],
  galleryImages: [],
  recordingUrl: null,
  presentationUrl: null,
  displayConfig: {},
  speakers: [],
};

describe("TS-028: toEventDTO carries the three event image fields", () => {
  it("maps each shape's field independently, without collapsing them into one", () => {
    const dto = toEventDTO({
      ...baseEvent,
      bannerUrl: "/api/uploads/banner.png",
      thumbnailUrl: "/api/uploads/thumb.png",
      posterUrl: "/api/uploads/poster.png",
    });

    expect(dto.bannerUrl).toBe("/api/uploads/banner.png");
    expect(dto.thumbnailUrl).toBe("/api/uploads/thumb.png");
    expect(dto.posterUrl).toBe("/api/uploads/poster.png");
  });

  it("passes a missing image through as null rather than substituting another shape's image", () => {
    // The portal resolves its own fallback chain (poster -> thumbnail -> banner) in
    // `utils/eventImage.ts`. If the mapper substituted here instead, the portal could never tell
    // "no poster uploaded" from "poster uploaded", and the wide slot — which deliberately has no
    // fallback — would start rendering cropped card art.
    const dto = toEventDTO({ ...baseEvent, bannerUrl: "/api/uploads/banner.png" });

    expect(dto.bannerUrl).toBe("/api/uploads/banner.png");
    expect(dto.thumbnailUrl).toBeNull();
    expect(dto.posterUrl).toBeNull();
  });
});
