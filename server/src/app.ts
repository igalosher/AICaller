import express from "express";
import cors from "cors";
import contactsRouter from "./routes/contacts.js";
import callsRouter from "./routes/calls.js";
import salesRouter from "./routes/sales.js";
import callFlowsRouter from "./routes/callFlows.js";
import catalogRouter from "./routes/catalog.js";
import intentsRouter from "./routes/intents.js";
import settingsRouter from "./routes/settings.js";
import dashboardRouter from "./routes/dashboard.js";
import webhooksRouter from "./routes/webhooks.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Twilio webhooks must not be rate-limited
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/webhooks")) return next();
    rateLimit(req, res, next);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "aicaller-server" });
  });

  app.use("/api/contacts", contactsRouter);
  app.use("/api/calls", callsRouter);
  app.use("/api/sales", salesRouter);
  app.use("/api/call-flows", callFlowsRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api/intents", intentsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/webhooks", webhooksRouter);

  app.use(errorHandler);
  return app;
}
