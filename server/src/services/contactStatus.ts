import type { ContactStatus } from "@prisma/client";
import { AppError } from "../middleware/errorHandler.js";

const ALLOWED: Record<ContactStatus, ContactStatus[]> = {
  pending: ["in_call", "sold", "callback", "refused"],
  in_call: ["pending", "sold", "callback", "refused"],
  sold: ["pending", "callback", "refused"],
  callback: ["in_call", "sold", "refused", "pending"],
  refused: ["pending", "callback", "sold"],
};

export function canTransition(from: ContactStatus, to: ContactStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: ContactStatus, to: ContactStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(400, `מעבר סטטוס לא חוקי: ${from} → ${to}`);
  }
}

export function isCallable(status: ContactStatus): boolean {
  return status !== "refused" && status !== "in_call";
}
