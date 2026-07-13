import type { SiteSettingsDTO } from "@repo/shared-types";
import { prisma } from "../../../db/client";

const SINGLETON_ID = "singleton";

/** Upserts on read so the row always exists without a separate migration-time seed dependency. */
export async function getSiteSettings(): Promise<SiteSettingsDTO> {
  const row = await prisma.siteSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
  return { contactEmail: row.contactEmail };
}
