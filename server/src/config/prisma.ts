import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";

import contract from "../../prisma/contract.json";

const DATABASE_URL = process.env["DATABASE_URL"];

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined");
}

export const prisma = postgres({
  contractJson: contract,
  url: DATABASE_URL,
});