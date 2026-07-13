import type { Prisma } from "@prisma/client";
import type { CertificateSettingsDTO, FeedbackSettingsDTO, SpeedDatingSettingsDTO } from "@repo/shared-types";
import {
  DEFAULT_CERTIFICATE_SETTINGS,
  DEFAULT_FEEDBACK_SETTINGS,
  DEFAULT_SPEED_DATING_SETTINGS,
} from "@repo/shared-types";
import { prisma } from "../../db/client";

const KEYS = {
  speedDating: "speed_dating",
  feedback: "feedback",
  certificate: "certificate",
} as const;

/** Reads a module settings row by key, falling back to a default when unset. */
async function getModuleSettings<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.moduleSettings.findUnique({ where: { key } });
  return row ? (row.data as T) : fallback;
}

/** Upserts a module settings row by key. */
async function setModuleSettings<T>(key: string, data: T): Promise<T> {
  await prisma.moduleSettings.upsert({
    where: { key },
    create: { key, data: data as unknown as Prisma.InputJsonValue },
    update: { data: data as unknown as Prisma.InputJsonValue },
  });
  return data;
}

export function getSpeedDatingSettings(): Promise<SpeedDatingSettingsDTO> {
  return getModuleSettings(KEYS.speedDating, DEFAULT_SPEED_DATING_SETTINGS);
}

export function setSpeedDatingSettings(
  data: SpeedDatingSettingsDTO,
): Promise<SpeedDatingSettingsDTO> {
  return setModuleSettings(KEYS.speedDating, data);
}

export function getFeedbackSettings(): Promise<FeedbackSettingsDTO> {
  return getModuleSettings(KEYS.feedback, DEFAULT_FEEDBACK_SETTINGS);
}

export function setFeedbackSettings(data: FeedbackSettingsDTO): Promise<FeedbackSettingsDTO> {
  return setModuleSettings(KEYS.feedback, data);
}

export function getCertificateSettings(): Promise<CertificateSettingsDTO> {
  return getModuleSettings(KEYS.certificate, DEFAULT_CERTIFICATE_SETTINGS);
}

export function setCertificateSettings(
  data: CertificateSettingsDTO,
): Promise<CertificateSettingsDTO> {
  return setModuleSettings(KEYS.certificate, data);
}
