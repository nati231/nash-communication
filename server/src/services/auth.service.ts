import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createUser,
  getUserByEmail,
} from "./user.service.js";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

const BCRYPT_COST = 12;

// Checked against when the email is unknown, so the time a login takes
// doesn't reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync("nash-timing-placeholder", BCRYPT_COST);

// A problem the person can be told about (wrong password, email already used).
// Anything that is not an AuthError is an unexpected failure and is not shown.
export class AuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  avatarUrl?: string | undefined;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function registerUser(input: RegisterInput) {
  const existingUser = await getUserByEmail(input.email);

  if (existingUser) {
    throw new AuthError("User with this email already exists", 409);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const user = await createUser({
    name: input.name,
    email: input.email,
    passwordHash,
    avatarUrl: input.avatarUrl,
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function loginUser(input: LoginInput) {
  const user = await getUserByEmail(input.email);

  if (!user) {
    // Do the same amount of work as a real check, then refuse.
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw new AuthError("Invalid email or password", 401);
  }

  const passwordValid = await bcrypt.compare(
    input.password,
    String(user.passwordHash),
  );

  if (!passwordValid) {
    throw new AuthError("Invalid email or password", 401);
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  };
}