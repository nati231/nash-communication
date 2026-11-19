import { Router, type Response } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware.js";
import { uploadLimiter } from "../middleware/rate-limit.js";
import fileRoutes from "./file.routes.js";

const router = Router();

const DEFAULT_TITLE = "Nash Meeting";
const MAX_TITLE_LENGTH = 200;

router.use("/:meetingId/files", uploadLimiter, fileRoutes);

// POST /api/meetings
// The host is always the logged-in user. A hostId in the request is ignored.
router.post(
  "/",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authorization token is required",
        });
      }

      const rawTitle: unknown = req.body?.title;

      if (rawTitle !== undefined && typeof rawTitle !== "string") {
        return res.status(400).json({
          success: false,
          message: "title must be text",
        });
      }

      const title = (rawTitle ?? "").trim() || DEFAULT_TITLE;

      if (title.length > MAX_TITLE_LENGTH) {
        return res.status(400).json({
          success: false,
          message: `title cannot be longer than ${MAX_TITLE_LENGTH} characters`,
        });
      }

      // A valid token can outlive its account, so check the user still exists.
      const host = await prisma.orm.public.User.first({ id: userId });

      if (!host) {
        return res.status(401).json({
          success: false,
          message: "Your account no longer exists. Please sign in again.",
        });
      }

      const meeting = await prisma.orm.public.Meeting.create({
        title,
        hostId: userId,
        id: randomUUID(),
      });

      return res.status(201).json({
        success: true,
        message: "Meeting created successfully",
        meeting,
      });
    } catch (error) {
      console.error("Create meeting error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create meeting",
      });
    }
  },
);

export default router;