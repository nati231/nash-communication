import type { Response } from "express";

import {
  registerUser,
  loginUser,
} from "../services/auth.service.js";

import {
  getUserById,
} from "../services/user.service.js";

import type {
  AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

export async function register(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { name, email, password, avatarUrl } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (typeof name !== "string" || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "Name and email must be strings",
      });
    }

    if (typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Password must be a string",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const user = await registerUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      avatarUrl,
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Registration failed";

    return res.status(400).json({
      success: false,
      message,
    });
  }
}

export async function login(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password must be strings",
      });
    }

    const result = await loginUser({
      email: email.trim().toLowerCase(),
      password,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Login failed";

    return res.status(401).json({
      success: false,
      message,
    });
  }
}

export async function me(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const user = await getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Failed to get current user",
    });
  }
}