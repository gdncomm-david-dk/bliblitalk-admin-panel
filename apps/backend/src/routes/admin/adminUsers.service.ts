import { Prisma } from "@prisma/client";
import type { CreateAdminUserInput, EmploymentType, RegistrantDTO, RegistrantListResult, Role } from "@repo/shared-types";
import { ADMIN_ROLES, isEventScoped } from "@repo/auth";
import { toCsv } from "@repo/shared-utils";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * SEC-011: an upper bound on one export. Not a security control on its own — the permission
 * is — but an export is the one call that can pull the entire registrant base into a single
 * response, and an unbounded one is both a memory risk and a bigger loss if the file leaks.
 * `exportRegistrants` reports when it truncates so the audit row records that too.
 */
const MAX_EXPORT_ROWS = 10_000;

/**
 * The row filter shared by the paged list and the export, so the two can never drift into
 * showing one set of people on screen and writing a different set to the file.
 */
function registrantWhere(
  search: string | undefined,
  requestingAdminId: string,
  requestingAdminRole: Role,
): Prisma.UserWhereInput {
  const searchFilter: Prisma.UserWhereInput[] = search
    ? [
        {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { institution: { contains: search, mode: "insensitive" } },
          ],
        },
      ]
    : [];
  const scopeFilter: Prisma.UserWhereInput[] = isEventScoped(requestingAdminRole)
    ? [{ registrations: { some: { event: { admins: { some: { id: requestingAdminId } } } } } }]
    : [];
  return { AND: [...searchFilter, ...scopeFilter] };
}

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

  const where = registrantWhere(params.search, requestingAdminId, requestingAdminRole);

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

/**
 * SEC-011: the registrant export, moved out of the browser.
 *
 * It used to be built client-side from whatever page the admin was looking at, which meant no
 * privilege was needed beyond reaching the page and no record existed that PII had left the
 * system. Running it here makes both fixable: the route gates on `registrant:export`, and the
 * caller writes an audit row with the actor and the row count.
 *
 * Returns every matching row up to `MAX_EXPORT_ROWS`, not just the current page — exporting a
 * page at a time was never the intent, and the old client-side version silently did exactly
 * that. `truncated` tells the caller whether the cap was hit so the audit trail can say so.
 */
export async function exportRegistrants(
  search: string | undefined,
  requestingAdminId: string,
  requestingAdminRole: Role,
): Promise<{ items: RegistrantDTO[]; truncated: boolean }> {
  const where = registrantWhere(search, requestingAdminId, requestingAdminRole);

  const users = await prisma.user.findMany({
    where,
    // One more than the cap, so hitting it is distinguishable from landing on it exactly.
    take: MAX_EXPORT_ROWS + 1,
    orderBy: { createdAt: "desc" },
    include: {
      registrations: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { registrations: true } },
    },
  });

  const truncated = users.length > MAX_EXPORT_ROWS;
  const items: RegistrantDTO[] = users.slice(0, MAX_EXPORT_ROWS).map((user) => ({
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

  return { items, truncated };
}

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  INTERNAL: "Internal (Employee)",
  EXTERNAL: "External",
};

/**
 * Builds the registrant CSV. Moved here from the browser with the export itself (SEC-011) —
 * the column set and formatting are unchanged, so the file an admin gets is the same one they
 * got before; only where it is produced, and what that made possible to gate and record, changed.
 *
 * `toCsv` quotes every field and neutralises spreadsheet formulas (SEC-026).
 */
export function registrantCsv(items: RegistrantDTO[]): string {
  return toCsv(
    [
      "Name",
      "Email",
      "Phone",
      "Institution",
      "Department",
      "Position",
      "YoE",
      "Type",
      "Events Joined",
      "Last Joined",
      "Registered Since",
    ],
    items.map((r) => [
      r.name,
      r.email,
      r.phone ?? "",
      r.institution ?? "",
      r.department ?? "",
      r.position ?? "",
      r.yearsOfExperience ?? "",
      EMPLOYMENT_TYPE_LABELS[r.employmentType],
      r.eventsJoinedCount,
      r.lastJoinedAt ? r.lastJoinedAt.slice(0, 10) : "",
      r.createdAt.slice(0, 10),
    ]),
  );
}

/**
 * Updates a user's admin role. Callers must already hold Permission.ROLE_MANAGE.
 * SEC-007: bumps tokenVersion so any session already issued to this user (which still carries
 * the old role claim) is rejected on its very next request instead of keeping the old
 * privilege level for up to 7 days.
 */
export async function updateUserRole(id: string, role: Role): Promise<{ id: string; role: Role }> {
  const user = await prisma.user.update({
    where: { id },
    data: { role, tokenVersion: { increment: 1 } },
  });
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
 * Grants an Admin CMS role (Super Admin, Event Admin, or Talent Acquisition) to a staff
 * member — there is no self-registration path for staff. Callers must already hold
 * Permission.ROLE_MANAGE.
 *
 * No credential is created: since the Apps Gateway migration the person authenticates with
 * their company account at the gateway, and this row only attaches an app-level role to
 * their email. Being listed here does not by itself let anyone in — the gateway's WHITELIST
 * decides that, and it is managed at /auth/ui/apps by DevOps, not from this app.
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
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email,
        // passwordHash is deliberately left null: nothing in this repo authenticates with
        // it any more, so writing one would be storing a credential nobody can use.
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
