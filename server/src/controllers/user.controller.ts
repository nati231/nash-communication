
import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";

export async function searchUsers(req: Request, res: Response) {
  try {
    const query = String(req.query["q"] ?? "").trim().toLowerCase();

    if (query.length < 2) {
      res.status(400).json({
        success: false,
        message: "Enter at least 2 characters to search.",
      });
      return;
    }

    const users = await prisma.orm.public.User.all();

    const matches = users
      .filter((user) => {
        const name = String(user.name ?? "").toLowerCase();
        const email = String(user.email ?? "").toLowerCase();

        return name.includes(query) || email.includes(query);
      })
      .slice(0, 20)
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      }));

    res.json({
      success: true,
      users: matches,
    });
  } catch (error) {
    console.error("User search failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to search users.",
    });
  }
}