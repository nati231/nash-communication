import bcrypt from "bcryptjs";
import { Request, Response } from "express";

export async function signup(req: Request, res: Response) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    return res.status(201).json({
      success: true,
      message: "Signup validation passed",
      data: {
        name,
        email,
        passwordHash,
      },
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}