import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { CreateAdminUserInput, EmploymentType, RegistrantDTO, RegistrantListResult, Role } from "@repo/shared-types";
import { ADMIN_ROLES, isEventScoped } from "@repo/auth";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface ListRegistrantsParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Lists users with contact info and how many events they've joined. EVENT_ADMIN is scoped to
 * users with a registration on an event that admin administers (mirrors getAdminDashboard);
 * other admin roles see the whole platform. Without this, USER_MANAGE — granted to
 * EVENT_ADMIN — let any single-event admin bulk-read every user's PII platform-wide.
 */
export async function listRegistrants(
  params: ListRegistrantsParams,
  requestingAdminId: string,
  requestingAdminRole: Role,
): Promise<RegistrantListResult> {
  const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
  const pageSize =
    params.pageSize && params.pageSize > 0 ? Math.min(Math.floor(params.pageSize), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  const searchFilter: Prisma.UserWhereInput[] = params.search
    ? [
        {
          OR: [
            { name: { contains: params.search, mode: "insensitive" } },
            { email: { contains: params.search, mode: "insensitive" } },
            { institution: { contains: params.search, mode: "insensitive" } },
          ],
        },
      ]
    : [];
  const scopeFilter: Prisma.UserWhereInput[] = isEventScoped(requestingAdminRole)
    ? [{ registrations: { some: { event: { admins: { some: { id: requestingAdminId } } } } } }]
    : [];
  const where: Prisma.UserWhereInput = { AND: [...searchFilter, ...scopeFilter] };

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
    yearsOfExperience: user.yearsOfExperience,
    role: user.role,
    employmentType: user.employmentType,
    eventsJoinedCount: user._count.registrations,
    lastJoinedAt: user.registrations[0]?.createdAt.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  }));

  return { items, total };
}

/** Updates a user's admin role. Callers must already hold Permission.ROLE_MANAGE. */
export async function updateUserRole(id: string, role: Role): Promise<{ id: string; role: Role }> {
  const user = await prisma.user.update({ where: { id }, data: { role } });
  return { id: user.id, role: user.role };
}

/** Updates a user's Internal (employee) / External classification. */
export async function updateUserEmploymentType(
  id: string,
  employmentType: EmploymentType,
): Promise<{ id: string; employmentType: EmploymentType }> {
  const user = await prisma.user.update({ where: { id }, data: { employmentType } });
  return { id: user.id, employmentType: user.employmentType };
}

/**
 * Provisions a new Admin CMS staff account (Super Admin, Event Admin, Talent
 * Acquisition, or Viewer) with a password the Super Admin sets here — there is no
 * self-registration path for staff. Callers must already hold Permission.ROLE_MANAGE.
 */
export async function createAdminUser(
  input: CreateAdminUserInput,
): Promise<{ id: string; name: string; email: string; role: Role }> {
  if (!ADMIN_ROLES.includes(input.role)) {
    throw new AppError("INVALID_ROLE", "Role must be one of the Admin CMS roles", 422);
  }
  // Normalize case so "Jane@x.com" can't provision a second, differently-privileged
  // account past the "jane@x.com" one — mail providers treat these as the same inbox.
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("EMAIL_TAKEN", "An account with this email already exists", 409);
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email,
        passwordHash,
        role: input.role,
        employmentType: "INTERNAL",
      },
    });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  } catch (err) {
    // Two concurrent requests for the same email can both pass the findUnique check
    // above; the DB's unique constraint still blocks the loser — map that race to the
    // same friendly 409 instead of letting a raw Prisma error fall through as a 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("EMAIL_TAKEN", "An account with this email already exists", 409);
    }
    throw err;
  }
}
