import { Router } from "express";
import { prisma } from "../db.js";
import { getActiveCall } from "../services/callService.js";

const router = Router();

router.get("/summary", async (_req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [total, pending, refused, soldToday, activeCall] = await Promise.all([
      prisma.contact.count({ where: { deletedAt: null } }),
      prisma.contact.count({ where: { deletedAt: null, status: "pending" } }),
      prisma.contact.count({ where: { deletedAt: null, status: "refused" } }),
      prisma.contact.count({
        where: { deletedAt: null, status: "sold", updatedAt: { gte: today } },
      }),
      getActiveCall(),
    ]);
    res.json({ total, pending, refused, soldToday, activeCall: Boolean(activeCall) });
  } catch (e) {
    next(e);
  }
});

export default router;
