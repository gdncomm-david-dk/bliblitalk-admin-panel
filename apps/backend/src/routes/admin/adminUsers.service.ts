import type { Prisma } from "@prisma/client";
import type { RegistrantDTO, RegistrantListResult } from "@repo/shared-types";
import { prisma } from "../../db/client";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface ListRegistrantsParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Lists every user in the system with contact info and how many events they've joined. */
export async function listRegistrants(params: ListRegistrantsParams): Promise<RegistrantListResult> {
  const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
  const pageSize =
    params.pageSize && params.pageSize > 0 ? Math.min(Math.floor(params.pageSize), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  const where: Prisma.UserWhereInput = params.search
    ? {
        OR: [
          { name: { contains: params.search, mode: "insensitive" } },
          { email: { contains: params.search, mode: "insensitive" } },
          { institution: { contains: params.search, mode: "insensitive" } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        registrations: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { registrations: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const items: RegistrantDTO[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    institution: user.institution,
    department: user.department,
    position: user.position,
    eventsJoinedCount: user._count.registrations,
    lastJoinedAt: user.registrations[0]?.createdAt.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  }));

  return { items, total };
}
