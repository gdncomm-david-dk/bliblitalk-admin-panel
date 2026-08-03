import type { AdminSpeakerDTO, CreateSpeakerInput, UpdateSpeakerInput } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { toSpeakerDTO } from "../../lib/shared/mappers";

type SpeakerWithCount = Parameters<typeof toSpeakerDTO>[0] & {
  _count: { events: number };
};

function toAdminSpeakerDTO(s: SpeakerWithCount): AdminSpeakerDTO {
  return { ...toSpeakerDTO(s), eventCount: s._count.events };
}

const speakerInclude = { _count: { select: { events: true } } } as const;

export async function listSpeakers(q?: string): Promise<AdminSpeakerDTO[]> {
  const speakers = await prisma.speaker.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: speakerInclude,
    orderBy: { name: "asc" },
  });
  return speakers.map(toAdminSpeakerDTO);
}

export async function createSpeaker(input: CreateSpeakerInput): Promise<AdminSpeakerDTO> {
  const speaker = await prisma.speaker.create({
    data: {
      name: input.name,
      title: input.title ?? null,
      company: input.company ?? null,
      bioShort: input.bioShort ?? null,
      bioLong: input.bioLong ?? null,
      credentials: input.credentials,
      avatarUrl: input.avatarUrl ?? null,
      featured: input.featured,
    },
    include: speakerInclude,
  });
  return toAdminSpeakerDTO(speaker);
}

export async function updateSpeaker(id: string, input: UpdateSpeakerInput): Promise<AdminSpeakerDTO> {
  const existing = await prisma.speaker.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Speaker not found", 404);

  const speaker = await prisma.speaker.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.company !== undefined && { company: input.company }),
      ...(input.bioShort !== undefined && { bioShort: input.bioShort }),
      ...(input.bioLong !== undefined && { bioLong: input.bioLong }),
      ...(input.credentials !== undefined && { credentials: input.credentials }),
      ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      ...(input.featured !== undefined && { featured: input.featured }),
    },
    include: speakerInclude,
  });
  return toAdminSpeakerDTO(speaker);
}

/** Implicit m-n relation auto-detaches from events on delete — no FK violation possible. */
export async function deleteSpeaker(id: string): Promise<void> {
  const existing = await prisma.speaker.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Speaker not found", 404);
  await prisma.speaker.delete({ where: { id } });
}
