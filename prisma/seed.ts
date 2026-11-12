import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ensureInitialAdmin } from "../src/lib/admin-seed";

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
    const result = await ensureInitialAdmin(prisma, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: ADMIN_NAME,
    });

    if (result.seeded) {
      console.log(`Seeded admin account: ${result.email} (${result.name})`);
    } else {
      console.log(`Updated admin account: ${result.email} (${result.name})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("Database seed failed:", err);
  process.exit(1);
});

