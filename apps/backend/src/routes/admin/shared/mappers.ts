import type { Certificate, Event, EventStatusHistory } from "@prisma/client";
import type { CertificateDTO, EventStatusHistoryDTO } from "@repo/shared-types";

export function toEventStatusHistoryDTO(h: EventStatusHistory): EventStatusHistoryDTO {
  return {
    id: h.id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actorType: h.actorType as "ADMIN" | "SYSTEM",
    actorId: h.actorId,
    reason: h.reason,
    sideEffectsStatus: h.sideEffectsStatus as "PENDING" | "DONE" | "FAILED" | "NONE",
    createdAt: h.createdAt.toISOString(),
  };
}

export function toCertificateDTO(c: Certificate & { event: Event }): CertificateDTO {
  return {
    id: c.id,
    eventTitle: c.event.title,
    issuedAt: c.issuedAt.toISOString(),
    verificationCode: c.verificationCode,
  };
}
