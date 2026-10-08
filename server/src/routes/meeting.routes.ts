import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { title, hostId } = req.body;

    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof hostId !== "string" ||
      !hostId.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "title and hostId are required",
      });
    }

    const meeting = await prisma.orm.public.Meeting.create({
      title: title.trim(),
      hostId: hostId.trim(),
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
});

export default router;