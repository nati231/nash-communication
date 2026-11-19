import type { Response } from "express";

import {
  AuthError,
  registerUser,
  loginUser,
} from "../services/auth.service.js";

import {
  getUserById,
} from "../services/user.service.js";

import type {
  AuthenticatedRequest,
} from "../middleware/auth.middleware.js";

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt only reads the first 72 bytes of a password.
const MAX_PASSWORD_BYTES = 72;
// Just a sanity cap on what login will accept.
const MAX_LOGIN_PASSWORD_LENGTH = 1000;
const MAX_AVATAR_URL_LENGTH = 500;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function badRequest(res: Response, message: string) {
  return res.status(400).json({
    success: false,
    message,
  });
}

// Returns the clean link, "" when none was given, or null when it is not valid.
function cleanAvatarUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  if (!trimmed) return "";
  if (trimmed.length > MAX_AVATAR_URL_LENGTH) return null;

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return trimmed;
}

export async function register(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const body: unknown = req.body;

    if (!isRecord(body)) {
      return badRequest(res, "Name, email and password are required");
    }

    const { name, email, password, avatarUrl } = body;

    if (!name || !email || !password) {
      return badRequest(res, "Name, email and password are required");
    }

    if (typeof name !== "string" || typeof email !== "string") {
      return badRequest(res, "Name and email must be strings");
    }

    if (typeof password !== "string") {
      return badRequest(res, "Password must be a string");
    }

    const cleanName = name.replace(CONTROL_CHARACTERS, " ").trim();

    if (!cleanName) {
      return badRequest(res, "Name is required");
    }

    if (cleanName.length > MAX_NAME_LENGTH) {
      return badRequest(
        res,
        `Name cannot be longer than ${MAX_NAME_LENGTH} characters`,
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(cleanEmail)) {
      return badRequest(res, "Enter a valid email address");
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return badRequest(
        res,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
      return badRequest(
        res,
        `Password is too long (maximum ${MAX_PASSWORD_BYTES} bytes; characters outside English letters count as more than one)`,
      );
    }

    const cleanAvatar = cleanAvatarUrl(avatarUrl);

    if (cleanAvatar === null) {
      return badRequest(
        res,
        "Profile picture must be a web link starting with http:// or https://",
      );
    }

    const user = await registerUser({
      name: cleanName,
      email: cleanEmail,
      password,
      avatarUrl: cleanAvatar || undefined,
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    // Anything else is unexpected: keep the details on the server.
    console.error("Registration failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not create the account. Please try again.",
    });
  }
}

export async function login(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const body: unknown = req.body;

    if (!isRecord(body)) {
      return badRequest(res, "Email and password are required");
    }

    const { email, password } = body;

    if (!email || !password) {
      return badRequest(res, "Email and password are required");
    }

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return badRequest(res, "Email and password must be strings");
    }

    if (
      email.length > MAX_EMAIL_LENGTH ||
      password.length > MAX_LOGIN_PASSWORD_LENGTH
    ) {
      // Too long to be a real account, so it gets the usual answer.
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
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
    if (error instanceof AuthError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    // Anything else is unexpected: keep the details on the server.
    console.error("Login failed:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
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