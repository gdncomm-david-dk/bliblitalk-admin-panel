import { RegistrationStatus } from "@repo/shared-types";

// seatsTaken only counts confirmed seats — WAITING/CANCELLED/REJECTED don't occupy capacity.
export const eventInclude = {
  speakers: true,
  category: true,
  _count: { select: { registrations: { where: { status: RegistrationStatus.REGISTERED } } } },
} as const;
