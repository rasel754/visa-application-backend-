import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

export interface InitialAdminConfig {
  email: string;
  password: string;
  name: string;
}

export async function ensureInitialAdmin(
  prismaClient: PrismaClient,
  config: InitialAdminConfig,
): Promise<{ seeded: boolean; updated: boolean; email: string; name: string }> {
  const normalizedEmail = config.email.toLowerCase().trim();
  const normalizedName = config.name.trim();
  const passwordHash = await bcrypt.hash(config.password, 12);

  const existing = await prismaClient.adminUser.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  const admin = await prismaClient.adminUser.upsert({
    where: { email: normalizedEmail },
    create: {
      email: normalizedEmail,
      passwordHash,
      name: normalizedName,
    },
    update: {
      passwordHash,
      name: normalizedName,
    },
    select: {
      email: true,
      name: true,
    },
  });

  return {
    seeded: !existing,
    updated: Boolean(existing),
    email: admin.email,
    name: admin.name,
  };
}
