import { env } from "./config/env";
import { initFormData } from "./config/form-data";
import { ensureInitialPlatformSeed } from "./lib/admin-seed";
import { prisma } from "./lib/prisma";
import { ensureStorageDirs } from "./lib/storage";
import { createApp } from "./app";

async function bootstrap(): Promise<void> {
  initFormData();
  ensureStorageDirs();

  const seeded = await ensureInitialPlatformSeed(prisma, {
    superAdminEmail: env.SUPER_ADMIN_EMAIL,
    superAdminPassword: env.SUPER_ADMIN_PASSWORD,
    superAdminName: env.SUPER_ADMIN_NAME,
    companyAdminEmail: env.ADMIN_EMAIL,
    companyAdminPassword: env.ADMIN_PASSWORD,
    companyAdminName: env.ADMIN_NAME,
  });
  console.log(`Initialized platform: SuperAdmin (${seeded.superAdmin.email}), Default Company (${seeded.defaultCompany.name})`);

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`IGL Visa Help Platform API listening on port ${env.PORT}`);
  });
}

bootstrap().catch((err: unknown) => {
  console.error("FATAL: Failed to start IGL Visa Help API:", err);
  process.exit(1);
});
