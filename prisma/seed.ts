import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ensureInitialPlatformSeed } from "../src/lib/admin-seed";

const seedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ADMIN_EMAIL: z.string().email("ADMIN_EMAIL must be a valid email").default("admin@iglvisahelp.com"),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be at least 8 characters").default("ChangeMeStrong123!"),
  ADMIN_NAME: z.string().min(1, "ADMIN_NAME is required").default("IGL Visa Help Admin"),
  SUPER_ADMIN_EMAIL: z.string().email().default("superadmin@iglvisahelp.com"),
  SUPER_ADMIN_PASSWORD: z.string().min(8).default("SuperAdminStrongPass2026!"),
  SUPER_ADMIN_NAME: z.string().min(1).default("IGL Platform Super Admin"),
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

  const {
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ADMIN_NAME,
    SUPER_ADMIN_EMAIL,
    SUPER_ADMIN_PASSWORD,
    SUPER_ADMIN_NAME,
  } = parsed.data;

  const prisma = new PrismaClient();

  try {
    const result = await ensureInitialPlatformSeed(prisma, {
      superAdminEmail: SUPER_ADMIN_EMAIL,
      superAdminPassword: SUPER_ADMIN_PASSWORD,
      superAdminName: SUPER_ADMIN_NAME,
      companyAdminEmail: ADMIN_EMAIL,
      companyAdminPassword: ADMIN_PASSWORD,
      companyAdminName: ADMIN_NAME,
    });

    console.log(`Seeded Super Admin: ${result.superAdmin.email}`);
    console.log(`Seeded Default Company: ${result.defaultCompany.name} (${result.defaultCompany.slug})`);
    console.log(`Seeded Company Admin: ${result.companyAdmin.email}`);

    // Seed secondary company for tenant isolation testing
    const skyCompany = await prisma.company.upsert({
      where: { slug: "sky-travels" },
      create: {
        name: "Sky Travels Ltd",
        slug: "sky-travels",
        prefix: "SKY",
        logoUrl: "/logo.png",
        phone: "+880-1700-112233",
        address: "Gulshan-2, Dhaka",
        isActive: true,
      },
      update: {
        name: "Sky Travels Ltd",
        prefix: "SKY",
        isActive: true,
      },
    });

    const skyPass = await bcrypt.hash("ChangeMeStrong123!", 12);
    await prisma.adminUser.upsert({
      where: { email: "admin@skytravels.com" },
      create: {
        email: "admin@skytravels.com",
        passwordHash: skyPass,
        name: "Sky Travels Admin",
        role: Role.COMPANY,
        companyId: skyCompany.id,
      },
      update: {
        passwordHash: skyPass,
        role: Role.COMPANY,
        companyId: skyCompany.id,
      },
    });
    console.log(`Seeded Test Company: Sky Travels Ltd (sky-travels, prefix: SKY, admin: admin@skytravels.com)`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("Database seed failed:", err);
  process.exit(1);
});
