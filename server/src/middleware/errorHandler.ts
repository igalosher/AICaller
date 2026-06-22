import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../logger.js";
import { toTelephonyError } from "../telephony/errors.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }
  const twilio = err as { status?: number; code?: number };
  if (twilio?.code && twilio?.status) {
    const mapped = toTelephonyError(err);
    res.status(mapped.statusCode).json({ error: mapped.message, code: mapped.code });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "בקשה לא תקינה",
      details: err.issues,
    });
    return;
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "שגיאת שרת פנימית" });
}

export function validate<T>(schema: { parse: (data: unknown) => T }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}
