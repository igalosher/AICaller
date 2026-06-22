import { prisma } from "../db.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  assertTransition,
  isCallable,
} from "./contactStatus.js";
import { isValidIsraeliPhone, normalizeIsraeliPhone } from "../utils/phone.js";
import { contactFullName } from "../utils/name.js";
import type { ContactStatus } from "@prisma/client";

export async function createContact(input: {
  firstName: string;
  familyName?: string;
  phone: string;
  notes?: string;
}) {
  if (!isValidIsraeliPhone(input.phone)) {
    throw new AppError(400, "מספר טלפון ישראלי לא תקין");
  }
  const phone = normalizeIsraeliPhone(input.phone);
  const existing = await prisma.contact.findFirst({
    where: { phone, deletedAt: null },
  });
  if (existing) {
    throw new AppError(409, "מספר טלפון כבר קיים ברשימה");
  }
  return prisma.contact.create({
    data: {
      firstName: input.firstName.trim(),
      familyName: input.familyName?.trim() ?? "",
      phone,
      notes: input.notes,
    },
  });
}

export async function listContacts(params: {
  search?: string;
  status?: ContactStatus;
  page?: number;
  pageSize?: number;
}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const where = {
    deletedAt: null,
    ...(params.status ? { status: params.status } : {}),
    ...(params.search
      ? {
          OR: [
            { firstName: { contains: params.search } },
            { familyName: { contains: params.search } },
            { phone: { contains: params.search } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getContact(id: string) {
  const contact = await prisma.contact.findFirst({
    where: { id, deletedAt: null },
    include: {
      calls: {
        orderBy: { startedAt: "desc" },
        include: { transcript: { orderBy: { timestamp: "asc" } } },
      },
    },
  });
  if (!contact) throw new AppError(404, "איש קשר לא נמצא");
  return contact;
}

export async function updateContact(
  id: string,
  input: {
    firstName?: string;
    familyName?: string;
    phone?: string;
    notes?: string;
    status?: ContactStatus;
  },
) {
  const contact = await getContact(id);
  if (input.phone) {
    if (!isValidIsraeliPhone(input.phone)) {
      throw new AppError(400, "מספר טלפון ישראלי לא תקין");
    }
    const phone = normalizeIsraeliPhone(input.phone);
    const dup = await prisma.contact.findFirst({
      where: { phone, deletedAt: null, NOT: { id } },
    });
    if (dup) throw new AppError(409, "מספר טלפון כבר קיים ברשימה");
    input.phone = phone;
  }
  if (input.status && input.status !== contact.status) {
    assertTransition(contact.status, input.status);
  }
  const data = {
    ...input,
    ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
    ...(input.familyName !== undefined ? { familyName: input.familyName.trim() } : {}),
  };
  return prisma.contact.update({ where: { id }, data });
}

export { contactFullName };

export async function deleteContact(id: string) {
  await getContact(id);
  return prisma.contact.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function transitionContactStatus(id: string, status: ContactStatus) {
  const contact = await getContact(id);
  assertTransition(contact.status, status);
  return prisma.contact.update({ where: { id }, data: { status } });
}

export function ensureCallable(status: ContactStatus): void {
  if (!isCallable(status)) {
    if (status === "refused") {
      throw new AppError(403, "לא ניתן להתקשר לאיש קשר שסירב", "CONTACT_REFUSED");
    }
    throw new AppError(409, "איש הקשר כבר בשיחה", "CONTACT_IN_CALL");
  }
}

export async function getNextCallableContact() {
  return prisma.contact.findFirst({
    where: {
      deletedAt: null,
      status: { in: ["pending", "callback"] },
    },
    orderBy: { updatedAt: "asc" },
  });
}
