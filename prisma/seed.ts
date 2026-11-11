import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const seedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ADMIN_EMAIL: z.string().email("ADMIN_EMAIL must be a valid email"),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be at least 8 characters"),
  ADMIN_NAME: z.string().min(1, "ADMIN_NAME is required"),
});

async function main(): Promise<void> {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables for seed:");
    for (const issue of parsed.error.issues) {
      console.error(`- ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = parsed.data;
  const prisma = new PrismaClient();

  try {
    const existingCount = await prisma.adminUser.count();
    if (existingCount > 0) {
      console.log("Admin user already exists. Skipping admin seed.");
      return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const admin = await prisma.adminUser.create({
      data: {
        email: ADMIN_EMAIL.toLowerCase().trim(),
        passwordHash,
        name: ADMIN_NAME.trim(),
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    console.log(`Seeded admin account: ${admin.email} (${admin.name})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("Database seed failed:", err);
  process.exit(1);
});

