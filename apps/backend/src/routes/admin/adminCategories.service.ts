import type { AdminCategoryDTO, CreateCategoryInput, UpdateCategoryInput } from "@repo/shared-types";
import { EventStatus } from "@repo/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";

type CategoryWithCount = {
  id: string;
  name: string;
  isActive: boolean;
  _count: { events: number };
};

function toAdminCategoryDTO(c: CategoryWithCount): AdminCategoryDTO {
  return { id: c.id, name: c.name, isActive: c.isActive, eventCount: c._count.events };
}

const categoryInclude = { _count: { select: { events: true } } } as const;

export async function listCategories(q?: string, includeInactive = false): Promise<AdminCategoryDTO[]> {
  const categories = await prisma.eventCategory.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: categoryInclude,
    orderBy: { name: "asc" },
  });
  return categories.map(toAdminCategoryDTO);
}

export async function createCategory(input: CreateCategoryInput): Promise<AdminCategoryDTO> {
  try {
    const category = await prisma.eventCategory.create({
      data: { name: input.name },
      include: categoryInclude,
    });
    return toAdminCategoryDTO(category);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("DUPLICATE_CATEGORY", `A category named "${input.name}" already exists.`, 409);
    }
    throw err;
  }
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<AdminCategoryDTO> {
  const existing = await prisma.eventCategory.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Category not found", 404);
  try {
    const category = await prisma.eventCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
      include: categoryInclude,
    });
    return toAdminCategoryDTO(category);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("DUPLICATE_CATEGORY", `A category named "${input.name}" already exists.`, 409);
    }
    throw err;
  }
}

/**
 * Hard-blocks if any non-finished event still references this category (409
 * CATEGORY_IN_USE); otherwise soft-deletes (isActive: false). Never physically
 * deletes the row — finished/cancelled/archived events keep a valid categoryId.
 */
export async function deleteCategory(id: string): Promise<void> {
  const existing = await prisma.eventCategory.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Category not found", 404);

  const upcomingCount = await prisma.event.count({
    where: {
      categoryId: id,
      status: { notIn: [EventStatus.COMPLETED, EventStatus.CANCELLED, EventStatus.ARCHIVED] },
    },
  });
  if (upcomingCount > 0) {
    throw new AppError(
      "CATEGORY_IN_USE",
      `${upcomingCount} upcoming event(s) still use this category.`,
      409,
      { upcomingCount },
    );
  }
  await prisma.eventCategory.update({ where: { id }, data: { isActive: false } });
}
