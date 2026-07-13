import type { EmailCampaign, MarketingContact } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type {
  AddMarketingContactInput,
  AddMarketingContactsBulkInput,
  CreateCampaignInput,
  EmailCampaignDTO,
  MarketingContactDTO,
} from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { sendBulkEmail } from "../../lib/shared/mailer";

function toMarketingContactDTO(c: MarketingContact): MarketingContactDTO {
  return {
    id: c.id,
    email: c.email,
    name: c.name,
    source: c.source,
    createdAt: c.createdAt.toISOString(),
  };
}

function toEmailCampaignDTO(c: EmailCampaign): EmailCampaignDTO {
  return {
    id: c.id,
    subject: c.subject,
    bodyHtml: c.bodyHtml,
    createdAt: c.createdAt.toISOString(),
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
    recipientCount: c.recipientCount,
    sentCount: c.sentCount,
    failedCount: c.failedCount,
  };
}

/** True if `err` is a Prisma known-request error with the given code (e.g. "P2002", "P2025"). */
function isPrismaErrorCode(err: unknown, code: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
  );
}

export async function listContacts(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: MarketingContactDTO[]; total: number }> {
  const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
  const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(Math.floor(params.pageSize), 100) : 20;

  const where: Prisma.MarketingContactWhereInput = params.search
    ? {
        OR: [
          { email: { contains: params.search, mode: "insensitive" } },
          { name: { contains: params.search, mode: "insensitive" } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.marketingContact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.marketingContact.count({ where }),
  ]);

  return { items: items.map(toMarketingContactDTO), total };
}

export async function addContact(input: AddMarketingContactInput): Promise<MarketingContactDTO> {
  try {
    const contact = await prisma.marketingContact.create({
      data: { email: input.email, name: input.name ?? null, source: "manual" },
    });
    return toMarketingContactDTO(contact);
  } catch (err) {
    if (isPrismaErrorCode(err, "P2002")) {
      throw new AppError("ALREADY_EXISTS", "This email is already in your contact list", 409);
    }
    throw err;
  }
}

export async function addContactsBulk(
  input: AddMarketingContactsBulkInput,
): Promise<{ added: number; skipped: number }> {
  const uniqueEmails = Array.from(new Set(input.emails));
  let added = 0;
  let skipped = 0;

  for (const email of uniqueEmails) {
    try {
      await prisma.marketingContact.create({ data: { email, source: "manual" } });
      added++;
    } catch (err) {
      if (isPrismaErrorCode(err, "P2002")) {
        skipped++;
      } else {
        throw err;
      }
    }
  }

  return { added, skipped };
}

export async function syncContactsFromRegistrants(): Promise<{ added: number; skipped: number }> {
  const users = await prisma.user.findMany({ select: { email: true, name: true } });
  const existing = await prisma.marketingContact.findMany({
    where: { email: { in: users.map((u) => u.email) } },
    select: { email: true },
  });
  const existingEmails = new Set(existing.map((c) => c.email));

  const missing = users.filter((u) => !existingEmails.has(u.email));

  if (missing.length > 0) {
    await prisma.marketingContact.createMany({
      data: missing.map((u) => ({ email: u.email, name: u.name, source: "registrant" })),
      skipDuplicates: true,
    });
  }

  return { added: missing.length, skipped: users.length - missing.length };
}

export async function removeContact(id: string): Promise<void> {
  try {
    await prisma.marketingContact.delete({ where: { id } });
  } catch (err) {
    if (isPrismaErrorCode(err, "P2025")) {
      throw new AppError("NOT_FOUND", "Contact not found", 404);
    }
    throw err;
  }
}

export async function listCampaigns(): Promise<EmailCampaignDTO[]> {
  const campaigns = await prisma.emailCampaign.findMany({ orderBy: { createdAt: "desc" } });
  return campaigns.map(toEmailCampaignDTO);
}

export async function createAndSendCampaign(input: CreateCampaignInput): Promise<EmailCampaignDTO> {
  const contacts =
    input.audience === "all"
      ? await prisma.marketingContact.findMany({ select: { email: true, name: true } })
      : await prisma.marketingContact.findMany({
          where: { id: { in: input.contactIds } },
          select: { email: true, name: true },
        });

  const extraRecipients = input.extraEmails.map((email) => ({ email, name: null as string | null }));

  const byEmail = new Map<string, { email: string; name: string | null }>();
  for (const r of [...contacts, ...extraRecipients]) {
    const key = r.email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, r);
  }
  const recipients = Array.from(byEmail.values());

  if (recipients.length === 0) {
    throw new AppError("NO_RECIPIENTS", "Select at least one contact or enter an email address", 400);
  }

  const campaign = await prisma.emailCampaign.create({
    data: {
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      recipientCount: recipients.length,
      recipients: {
        create: recipients.map((r) => ({ email: r.email, name: r.name })),
      },
    },
  });

  const result = await sendBulkEmail(recipients, input.subject, input.bodyHtml);
  const failedEmails = new Set(result.errors.map((e) => e.email.toLowerCase()));

  for (const r of recipients) {
    const failure = result.errors.find((e) => e.email.toLowerCase() === r.email.toLowerCase());
    if (failure) {
      await prisma.emailCampaignRecipient.updateMany({
        where: { campaignId: campaign.id, email: r.email },
        data: { status: "FAILED", error: failure.error },
      });
    } else if (!failedEmails.has(r.email.toLowerCase())) {
      await prisma.emailCampaignRecipient.updateMany({
        where: { campaignId: campaign.id, email: r.email },
        data: { status: "SENT" },
      });
    }
  }

  const updated = await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      sentAt: new Date(),
      sentCount: result.sentCount,
      failedCount: result.failedCount,
    },
  });

  return toEmailCampaignDTO(updated);
}
