import { describe, it, expect, afterAll } from "vitest";
import { Role } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { syncContactsFromRegistrants } from "./adminMarketing.service";

const PARTICIPANT_EMAIL = "sec030-sync-participant@example.com";
const ADMIN_EMAIL = "sec030-sync-eventadmin@example.com";
const SUPERADMIN_EMAIL = "sec030-sync-superadmin@example.com";
const ALL = [PARTICIPANT_EMAIL, ADMIN_EMAIL, SUPERADMIN_EMAIL];

describe("syncContactsFromRegistrants", () => {
  afterAll(async () => {
    await prisma.marketingContact.deleteMany({ where: { email: { in: ALL } } });
    await prisma.user.deleteMany({ where: { email: { in: ALL } } });
  });

  // SEC-030: staff addresses used to be swept into the marketing audience, which is the list
  // `audience: "all"` blasts from noreply@blibli.com — putting the people who can send the
  // blast inside its recipient list.
  it("takes participants and leaves every staff account out of the audience", async () => {
    await prisma.user.deleteMany({ where: { email: { in: ALL } } });
    await prisma.user.createMany({
      data: [
        { name: "Sync Participant", email: PARTICIPANT_EMAIL, role: Role.PARTICIPANT },
        { name: "Sync Event Admin", email: ADMIN_EMAIL, role: Role.EVENT_ADMIN },
        { name: "Sync Super Admin", email: SUPERADMIN_EMAIL, role: Role.SUPER_ADMIN },
      ],
    });

    await syncContactsFromRegistrants();

    const synced = await prisma.marketingContact.findMany({
      where: { email: { in: ALL } },
      select: { email: true },
    });
    expect(synced.map((c) => c.email)).toEqual([PARTICIPANT_EMAIL]);
  });
});
