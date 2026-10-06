import { prisma } from "../config/prisma.js";

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  passwordHash?: string;
  avatarUrl?: string | null;
}

export async function createUser(input: CreateUserInput) {
  return prisma.orm.public.User.create({
    name: input.name,
    email: input.email,
    passwordHash: input.passwordHash,
    avatarUrl: input.avatarUrl,
  });
}

export async function getUsers() {
  return prisma.orm.public.User.all();
}

export async function getUserById(id: string) {
  return prisma.orm.public.User.first({
    id,
  });
}

export async function getUserByEmail(email: string) {
  return prisma.orm.public.User.first({
    email,
  });
}