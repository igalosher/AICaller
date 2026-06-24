import { Router } from "express";
import { z } from "zod";
import {
  createContact,
  deleteContact,
  getContact,
  listContacts,
  updateContact,
} from "../services/contactService.js";
import { validate } from "../middleware/errorHandler.js";

const router = Router();

const createSchema = z.object({
  firstName: z.string().min(1),
  familyName: z.string().optional(),
  phone: z.string().min(9),
  sex: z.enum(["male", "female"]).optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  familyName: z.string().optional(),
  phone: z.string().min(9).optional(),
  sex: z.enum(["male", "female"]).optional(),
  notes: z.string().optional(),
  status: z.enum(["pending", "in_call", "sold", "callback", "refused", "blacklisted"]).optional(),
});

router.post("/", validate(createSchema), async (req, res, next) => {
  try {
    const contact = await createContact(req.body);
    res.status(201).json(contact);
  } catch (e) {
    next(e);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const result = await listContacts({
      search: req.query.search as string | undefined,
      status: req.query.status as
        | "pending"
        | "in_call"
        | "sold"
        | "callback"
        | "refused"
        | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json(await getContact(req.params.id));
  } catch (e) {
    next(e);
  }
});

router.put("/:id", validate(updateSchema), async (req, res, next) => {
  try {
    res.json(await updateContact(String(req.params.id), req.body));
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await deleteContact(String(req.params.id));
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

export default router;
