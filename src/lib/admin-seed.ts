import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

export interface SeedConfig {
  superAdminEmail: string;
  superAdminPassword: string;
  superAdminName: string;
  companyAdminEmail: string;
  companyAdminPassword: string;
  companyAdminName: string;
}

export async function ensureInitialPlatformSeed(
  prismaClient: PrismaClient,
  config: SeedConfig,
): Promise<{
  superAdmin: { email: string; name: string };
  defaultCompany: { id: string; name: string; slug: string; prefix: string };
  companyAdmin: { email: string; name: string };
}> {
  // 1. Ensure default Company "IGL Visa Help"
  const defaultCompany = await prismaClient.company.upsert({
    where: { slug: "igl-visa-help" },
    create: {
      name: "IGL Visa Help",
      slug: "igl-visa-help",
      prefix: "IGL",
      logoUrl: "/logo.png",
      phone: "+880-1958-666999",
      address: "Dhaka, Bangladesh",
      isActive: true,
    },
    update: {
      name: "IGL Visa Help",
      prefix: "IGL",
      isActive: true,
    },
  });

  // 2. Ensure Super Admin
  const superEmail = config.superAdminEmail.toLowerCase().trim();
  const superPasswordHash = await bcrypt.hash(config.superAdminPassword, 12);
  const superAdmin = await prismaClient.adminUser.upsert({
    where: { email: superEmail },
    create: {
      email: superEmail,
      passwordHash: superPasswordHash,
      name: config.superAdminName.trim(),
      role: Role.SUPER_ADMIN,
      companyId: null,
    },
    update: {
      passwordHash: superPasswordHash,
      name: config.superAdminName.trim(),
      role: Role.SUPER_ADMIN,
      companyId: null,
    },
    select: { email: true, name: true },
  });

  // 3. Ensure Company Admin for IGL
  const compAdminEmail = config.companyAdminEmail.toLowerCase().trim();
  const compPasswordHash = await bcrypt.hash(config.companyAdminPassword, 12);
  const companyAdmin = await prismaClient.adminUser.upsert({
    where: { email: compAdminEmail },
    create: {
      email: compAdminEmail,
      passwordHash: compPasswordHash,
      name: config.companyAdminName.trim(),
      role: Role.COMPANY,
      companyId: defaultCompany.id,
    },
    update: {
      passwordHash: compPasswordHash,
      name: config.companyAdminName.trim(),
      role: Role.COMPANY,
      companyId: defaultCompany.id,
    },
    select: { email: true, name: true },
  });

  return {
    superAdmin,
    defaultCompany: {
      id: defaultCompany.id,
      name: defaultCompany.name,
      slug: defaultCompany.slug,
      prefix: defaultCompany.prefix,
    },
    companyAdmin,
  };
}

// Backwards compatibility helper
export async function ensureInitialAdmin(
  prismaClient: PrismaClient,
  config: { email: string; password: string; name: string },
) {
  const result = await ensureInitialPlatformSeed(prismaClient, {
    superAdminEmail: "superadmin@iglvisahelp.com",
    superAdminPassword: "SuperAdminStrongPass2026!",
    superAdminName: "IGL Platform Super Admin",
    companyAdminEmail: config.email,
    companyAdminPassword: config.password,
    companyAdminName: config.name,
  });
  return {
    seeded: true,
    updated: false,
    email: result.companyAdmin.email,
    name: result.companyAdmin.name,
  };
}
