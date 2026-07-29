import { prisma } from "../../../db/client";

/**
 * Speakers shown on the portal's public landing strip. Prefers the speakers an
 * admin has flagged `featured`; when none are flagged yet, falls back to the
 * full roster so the strip is never empty. Ordered by name for a stable layout
 * (the Speaker model has no createdAt to order by).
 */
export async function listPublicSpeakers(limit = 12) {
  const featured = await prisma.speaker.findMany({
    where: { featured: true },
    orderBy: { name: "asc" },
    take: limit,
  });
  if (featured.length > 0) return featured;
  return prisma.speaker.findMany({ orderBy: { name: "asc" }, take: limit });
}
