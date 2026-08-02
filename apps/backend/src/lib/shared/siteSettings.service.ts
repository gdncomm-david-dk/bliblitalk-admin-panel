import type { SiteSettingsDTO } from "@repo/shared-types";
import { prisma } from "../../db/client";

const SINGLETON_ID = "singleton";

/** Idempotent — creates the singleton row on first call, no-ops on every call after. */
function ensureSiteSettingsRow() {
  return prisma.siteSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

/** Named separately from a plain read so the write this GET performs stays greppable. */
export async function getSiteSettings(): Promise<SiteSettingsDTO> {
  const row = await ensureSiteSettingsRow();
  return { contactEmail: row.contactEmail };
}

export async function setSiteSettings(data: SiteSettingsDTO): Promise<SiteSettingsDTO> {
  const row = await prisma.siteSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, contactEmail: data.contactEmail },
    update: { contactEmail: data.contactEmail },
  });
  return { contactEmail: row.contactEmail };
}
