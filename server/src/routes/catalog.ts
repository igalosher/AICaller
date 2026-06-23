import { Router } from "express";
import {
  channelsInPacket,
  describeChannel,
  getChannelById,
  listCatalogChannels,
} from "../services/catalogChannelLookup.js";

const router = Router();

router.get("/channels", async (_req, res, next) => {
  try {
    res.json(await listCatalogChannels());
  } catch (e) {
    next(e);
  }
});

router.get("/channels/:id", async (req, res, next) => {
  try {
    const channel = await getChannelById(req.params.id);
    if (!channel) {
      const byName = await describeChannel(req.params.id);
      if (!byName) {
        res.status(404).json({ error: "ערוץ לא נמצא" });
        return;
      }
      res.json(byName);
      return;
    }
    res.json(channel);
  } catch (e) {
    next(e);
  }
});

router.get("/packets/:name/channels", async (req, res, next) => {
  try {
    const channels = await channelsInPacket(req.params.name);
    res.json({ packetName: req.params.name, channels });
  } catch (e) {
    next(e);
  }
});

export default router;
